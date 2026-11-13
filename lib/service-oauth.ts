import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { ServiceId, ServiceCredentials } from "@/lib/service-connectors";

export type OAuthServiceId = "github" | "notion";
export type OAuthStatePayload = {
  state: string;
  userId: string;
  serviceId: OAuthServiceId;
  createdAt: number;
  codeVerifier?: string;
};

function authSecret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("OAUTH_STATE_SECRET_UNAVAILABLE");
  return value;
}

function hmac(value: string): Buffer {
  return createHmac("sha256", authSecret()).update(value).digest();
}

export function createOAuthState(userId: string, serviceId: OAuthServiceId) {
  const payload: OAuthStatePayload = {
    state: randomBytes(32).toString("base64url"),
    userId,
    serviceId,
    createdAt: Date.now(),
    ...(serviceId === "github" ? { codeVerifier: randomBytes(48).toString("base64url") } : {}),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    state: payload.state,
    cookieValue: encoded + "." + hmac(encoded).toString("base64url"),
    codeChallenge: payload.codeVerifier
      ? createHash("sha256").update(payload.codeVerifier).digest("base64url")
      : undefined,
  };
}

export function verifyOAuthState(cookieValue: string, state: string, serviceId: OAuthServiceId): OAuthStatePayload {
  const [encoded, signature, extra] = cookieValue.split(".");
  if (!encoded || !signature || extra) throw new Error("OAUTH_STATE_INVALID");
  const expected = hmac(encoded);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("OAUTH_STATE_INVALID");
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new Error("OAUTH_STATE_INVALID");
  }
  if (
    payload.serviceId !== serviceId ||
    payload.state !== state ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    !Number.isFinite(payload.createdAt) ||
    Date.now() - payload.createdAt > 10 * 60 * 1000 ||
    payload.createdAt > Date.now() + 30_000
  ) throw new Error("OAUTH_STATE_INVALID");
  return payload;
}

export function oauthRedirectUri(origin: string, serviceId: OAuthServiceId): string {
  const base = process.env.APP_BASE_URL || process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || origin;
  const url = new URL(base);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("OAUTH_REDIRECT_HTTPS_REQUIRED");
  }
  return new URL(`/api/admin/service-connectors/oauth/${serviceId}/callback`, url.origin).toString();
}

export function getOAuthAppCredentials(serviceId: OAuthServiceId) {
  if (serviceId === "github") {
    const clientId = process.env.GITHUB_APP_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET?.trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function refreshOAuthCredentials(
  serviceId: OAuthServiceId,
  credentials: ServiceCredentials,
): Promise<ServiceCredentials> {
  const expiresAt = Number(credentials.expiresAt ?? 0);
  if (!expiresAt || expiresAt > Date.now() + 90_000) return credentials;
  const refreshToken = credentials.refreshToken;
  if (!refreshToken) throw new Error("OAUTH_REAUTHORIZE_REQUIRED");
  const app = getOAuthAppCredentials(serviceId);
  if (!app) throw new Error("OAUTH_APP_CONFIGURATION_MISSING");

  let response: Response;
  if (serviceId === "github") {
    response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } else {
    response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(app.clientId + ":" + app.clientSecret).toString("base64"),
        "Notion-Version": "2026-03-11",
      },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  }
  if (!response.ok) throw new Error("OAUTH_REFRESH_FAILED");
  const payload = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    error?: string;
  };
  if (!payload.access_token) throw new Error(payload.error || "OAUTH_REFRESH_FAILED");
  return {
    ...credentials,
    token: payload.access_token,
    refreshToken: payload.refresh_token ?? refreshToken,
    expiresAt: payload.expires_in ? String(Date.now() + payload.expires_in * 1000) : "",
    refreshExpiresAt: payload.refresh_token_expires_in
      ? String(Date.now() + payload.refresh_token_expires_in * 1000)
      : credentials.refreshExpiresAt ?? "",
  };
}

export function isOAuthServiceId(value: ServiceId): value is OAuthServiceId {
  return value === "github" || value === "notion";
}
