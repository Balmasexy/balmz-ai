import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { getDbPool } from "@/lib/db";
import {
  getCustomerOAuthProvider,
  getCustomerOAuthProviderStatus,
  buildCustomerOAuthAuthorizationUrl,
  buildCustomerOAuthCallbackUrl,
} from "@/lib/integrations/customer-oauth-registry.js";

export {
  getCustomerOAuthProvider,
  getCustomerOAuthProviderStatus,
  buildCustomerOAuthAuthorizationUrl,
  buildCustomerOAuthCallbackUrl,
};

export type CustomerOAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string[];
  expiresAt: string | null;
  idToken: string | null;
};

export type CustomerOAuthIdentity = {
  providerAccountId: string;
  displayName: string;
  email: string | null;
};

export function hashCustomerOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function createCustomerOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function createCustomerOAuthPkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function createCustomerOAuthPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

function customerOAuthEncryptionKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("OAUTH_TOKEN_ENCRYPTION_UNAVAILABLE");
  return scryptSync(secret, "balmz-customer-oauth-token-encryption-v1", 32);
}

export function encryptCustomerOAuthValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", customerOAuthEncryptionKey(), iv);
  cipher.setAAD(Buffer.from("balmz-customer-oauth-v1"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCustomerOAuthValue(value: string): string {
  const [ivPart, tagPart, ciphertextPart] = value.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error("OAUTH_TOKEN_ENCRYPTED_VALUE_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", customerOAuthEncryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from("balmz-customer-oauth-v1"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function getCustomerOAuthCredentials(providerId: string) {
  const provider = getCustomerOAuthProvider(providerId);
  if (!provider) return null;
  const clientId = process.env[provider.clientIdEnv]?.trim() || "";
  const clientSecret = process.env[provider.clientSecretEnv]?.trim() || "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

type RawTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  id_token?: unknown;
  error?: unknown;
};

function normalizedScopes(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").slice(0, 100);
  if (typeof value === "string" && value.trim()) return value.split(/[ ,]+/).filter(Boolean).slice(0, 100);
  return fallback;
}

function normalizeTokenResponse(payload: RawTokenResponse, previousRefreshToken: string | null = null): CustomerOAuthTokenSet {
  if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("OAUTH_TOKEN_EXCHANGE_FAILED");
  const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
    ? Math.max(0, Math.min(payload.expires_in, 31_536_000))
    : null;
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" && payload.refresh_token
      ? payload.refresh_token
      : previousRefreshToken,
    tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    scope: normalizedScopes(payload.scope, []),
    expiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000).toISOString(),
    idToken: typeof payload.id_token === "string" ? payload.id_token : null,
  };
}

async function parseProviderJson(response: Response, failureCode: string): Promise<Record<string, unknown>> {
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error(failureCode); }
  if (!response.ok || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(failureCode);
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error) throw new Error(failureCode);
  return record;
}

export async function exchangeCustomerOAuthCode(
  providerId: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<CustomerOAuthTokenSet> {
  const provider = getCustomerOAuthProvider(providerId);
  const credentials = getCustomerOAuthCredentials(providerId);
  if (!provider || !credentials) throw new Error("OAUTH_PROVIDER_NOT_CONFIGURED");
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };
  if (provider.usePkce) body.code_verifier = codeVerifier;

  const headers: Record<string, string> = { Accept: "application/json" };
  let requestBody: string;
  if (provider.tokenFormat === "json") {
    headers["Content-Type"] = "application/json";
    headers.Authorization = "Basic " + Buffer.from(credentials.clientId + ":" + credentials.clientSecret).toString("base64");
    requestBody = JSON.stringify(body);
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (provider.tokenAuth === "basic") {
      headers.Authorization = "Basic " + Buffer.from(credentials.clientId + ":" + credentials.clientSecret).toString("base64");
    } else {
      body.client_id = credentials.clientId;
      body.client_secret = credentials.clientSecret;
    }
    requestBody = new URLSearchParams(body).toString();
  }

  let response: Response;
  try {
    response = await fetch(provider.tokenUrl, {
      method: "POST",
      headers,
      body: requestBody,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("OAUTH_TOKEN_ENDPOINT_UNAVAILABLE");
  }
  const payload = await parseProviderJson(response, "OAUTH_TOKEN_EXCHANGE_FAILED");
  const tokens = normalizeTokenResponse(payload as RawTokenResponse);
  if (!tokens.scope.length) tokens.scope = provider.scopes;
  return tokens;
}

async function fetchProviderIdentity(providerId: string, accessToken: string): Promise<CustomerOAuthIdentity> {
  const provider = getCustomerOAuthProvider(providerId);
  if (!provider) throw new Error("OAUTH_PROVIDER_UNSUPPORTED");
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: "Bearer " + accessToken,
  };
  if (providerId === "github") {
    headers["X-GitHub-Api-Version"] = "2022-11-28";
    headers["User-Agent"] = "BALMZ-AI";
  }
  if (providerId === "dropbox") headers["Content-Type"] = "application/json";
  if (providerId === "notion") headers["Notion-Version"] = "2022-06-28";

  let response: Response;
  try {
    response = await fetch(provider.userInfoUrl, {
      method: provider.userInfoMethod || "GET",
      headers,
      ...(provider.userInfoMethod === "POST" ? { body: "{}" } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("OAUTH_PROFILE_UNAVAILABLE");
  }
  const profile = await parseProviderJson(response, "OAUTH_PROFILE_UNAVAILABLE");

  if (providerId === "slack" && profile.ok !== true) throw new Error("OAUTH_PROFILE_UNAVAILABLE");
  if (providerId === "github") {
    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (emailResponse?.ok) {
      const emails = await emailResponse.json().catch(() => null) as Array<{ email?: string; primary?: boolean; verified?: boolean }> | null;
      const primary = Array.isArray(emails) ? emails.find((item) => item.primary && item.verified) : null;
      if (primary?.email) profile.email = primary.email;
    }
  }

  let id = "";
  let displayName = "";
  let email: string | null = null;
  switch (providerId) {
    case "google":
    case "microsoft":
      id = typeof profile.sub === "string" ? profile.sub : "";
      displayName = typeof profile.name === "string" ? profile.name : "";
      email = typeof profile.email === "string" ? profile.email : null;
      break;
    case "slack":
      id = typeof profile.user_id === "string" ? profile.user_id : "";
      displayName = typeof profile.user === "string" ? profile.user : typeof profile.team === "string" ? profile.team : "";
      break;
    case "dropbox": {
      id = typeof profile.account_id === "string" ? profile.account_id : "";
      const name = profile.name && typeof profile.name === "object" ? profile.name as Record<string, unknown> : {};
      displayName = typeof name.display_name === "string" ? name.display_name : "";
      email = typeof profile.email === "string" ? profile.email : null;
      break;
    }
    case "box":
      id = typeof profile.id === "string" || typeof profile.id === "number" ? String(profile.id) : "";
      displayName = typeof profile.name === "string" ? profile.name : "";
      email = typeof profile.login === "string" ? profile.login : null;
      break;
    case "github":
      id = typeof profile.id === "number" || typeof profile.id === "string" ? String(profile.id) : "";
      displayName = typeof profile.name === "string" && profile.name ? profile.name : typeof profile.login === "string" ? profile.login : "";
      email = typeof profile.email === "string" ? profile.email : null;
      break;
    case "gitlab":
      id = typeof profile.id === "number" || typeof profile.id === "string" ? String(profile.id) : "";
      displayName = typeof profile.name === "string" && profile.name ? profile.name : typeof profile.username === "string" ? profile.username : "";
      email = typeof profile.email === "string" ? profile.email : null;
      break;
    case "notion": {
      id = typeof profile.id === "string" ? profile.id : "";
      displayName = typeof profile.name === "string" ? profile.name : "";
      const person = profile.person && typeof profile.person === "object" ? profile.person as Record<string, unknown> : {};
      email = typeof person.email === "string" ? person.email : null;
      break;
    }
  }
  if (!id) throw new Error("OAUTH_PROFILE_ID_MISSING");
  return { providerAccountId: id.slice(0, 255), displayName: (displayName || email || provider.label).slice(0, 180), email };
}

export async function completeCustomerOAuthConnection(input: {
  userId: string;
  providerId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const provider = getCustomerOAuthProvider(input.providerId);
  if (!provider) throw new Error("OAUTH_PROVIDER_UNSUPPORTED");
  const tokens = await exchangeCustomerOAuthCode(input.providerId, input.code, input.codeVerifier, input.redirectUri);
  const identity = await fetchProviderIdentity(input.providerId, tokens.accessToken);
  const encrypted = encryptCustomerOAuthValue(JSON.stringify(tokens));
  const result = await getDbPool().query<{
    id: string;
    provider_id: string;
    provider_account_id: string;
    display_name: string;
    email: string | null;
    scopes: string[];
    token_expires_at: string | null;
    status: string;
  }>(
    `INSERT INTO public.balmz_customer_oauth_connections
       (id, user_id, provider_id, provider_account_id, display_name, email,
        encrypted_tokens, scopes, token_expires_at, status, last_verified_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'connected', now(), now())
     ON CONFLICT (user_id, provider_id, provider_account_id)
     DO UPDATE SET display_name = EXCLUDED.display_name,
                   email = EXCLUDED.email,
                   encrypted_tokens = EXCLUDED.encrypted_tokens,
                   scopes = EXCLUDED.scopes,
                   token_expires_at = EXCLUDED.token_expires_at,
                   status = 'connected',
                   last_error_code = NULL,
                   disconnected_at = NULL,
                   last_verified_at = now(),
                   updated_at = now()
     RETURNING id, provider_id, provider_account_id, display_name, email, scopes,
               token_expires_at, status`,
    [randomBytes(16).toString("hex"), input.userId, input.providerId, identity.providerAccountId,
      identity.displayName, identity.email, encrypted, tokens.scope.length ? tokens.scope : provider.scopes,
      tokens.expiresAt],
  );
  return result.rows[0];
}

export async function refreshCustomerOAuthConnection(userId: string, connectionId: string) {
  const result = await getDbPool().query<{
    id: string; provider_id: string; encrypted_tokens: string;
  }>(
    `SELECT id, provider_id, encrypted_tokens
       FROM public.balmz_customer_oauth_connections
      WHERE id = $1 AND user_id = $2 AND status = 'connected'
      LIMIT 1`,
    [connectionId, userId],
  );
  const connection = result.rows[0];
  if (!connection) throw new Error("OAUTH_CONNECTION_NOT_FOUND");
  const stored = JSON.parse(decryptCustomerOAuthValue(connection.encrypted_tokens)) as CustomerOAuthTokenSet;
  if (!stored.refreshToken) throw new Error("OAUTH_REAUTH_REQUIRED");
  const provider = getCustomerOAuthProvider(connection.provider_id);
  const credentials = getCustomerOAuthCredentials(connection.provider_id);
  if (!provider || !credentials) throw new Error("OAUTH_PROVIDER_NOT_CONFIGURED");
  const refreshPayload: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
  };
  const refreshHeaders: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (provider.tokenAuth === "basic") {
    refreshHeaders.Authorization = "Basic " + Buffer.from(credentials.clientId + ":" + credentials.clientSecret).toString("base64");
  } else {
    refreshPayload.client_id = credentials.clientId;
    refreshPayload.client_secret = credentials.clientSecret;
  }
  let response: Response;
  try {
    response = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: refreshHeaders,
      body: new URLSearchParams(refreshPayload).toString(),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("OAUTH_REFRESH_UNAVAILABLE");
  }
  const payload = await parseProviderJson(response, "OAUTH_REFRESH_FAILED");
  const updated = normalizeTokenResponse(payload as RawTokenResponse, stored.refreshToken);
  if (!updated.scope.length) updated.scope = stored.scope;
  await getDbPool().query(
    `UPDATE public.balmz_customer_oauth_connections
        SET encrypted_tokens = $3, scopes = $4, token_expires_at = $5,
            status = 'connected', last_error_code = NULL,
            last_verified_at = now(), updated_at = now()
      WHERE id = $1 AND user_id = $2`,
    [connectionId, userId, encryptCustomerOAuthValue(JSON.stringify(updated)), updated.scope, updated.expiresAt],
  );
  return { refreshed: true, expiresAt: updated.expiresAt };
}

export async function revokeCustomerOAuthAccess(providerId: string, encryptedTokens: string) {
  const provider = getCustomerOAuthProvider(providerId);
  if (!provider) return;
  const tokens = JSON.parse(decryptCustomerOAuthValue(encryptedTokens)) as CustomerOAuthTokenSet;
  const token = tokens.accessToken;
  const revokeEndpoints: Record<string, string> = {
    google: "https://oauth2.googleapis.com/revoke",
    dropbox: "https://api.dropboxapi.com/2/auth/token/revoke",
    slack: "https://slack.com/api/auth.revoke",
  };
  const endpoint = revokeEndpoints[providerId];
  if (!endpoint || !token) return;
  try {
    const body = providerId === "google"
      ? new URLSearchParams({ token }).toString()
      : "";
    const method = providerId === "google" ? "POST" : "POST";
    await fetch(endpoint, {
      method,
      headers: providerId === "google"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : { Authorization: "Bearer " + token },
      ...(body ? { body } : {}),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // The caller still removes the local token record; provider revocation can be completed in its account-security page.
  }
}
