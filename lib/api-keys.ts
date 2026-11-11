import { createHash, randomBytes } from "node:crypto";
import { getDbPool } from "@/lib/db";

export type BalmzApiEnvironment = "demo" | "live";

export type AuthenticatedApiKey = {
  id: string;
  name: string;
  environment: BalmzApiEnvironment;
  scopes: string[];
  createdByUserId: string | null;
};

export function sha256ApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createBalmzApiKey(environment: BalmzApiEnvironment) {
  const secret = randomBytes(36).toString("base64url");
  const value = `balmz_${environment}_${secret}`;
  return {
    value,
    keyPrefix: value.slice(0, 20),
    keyHash: sha256ApiKey(value),
    lastFour: value.slice(-4),
  };
}

export async function authenticateBalmzApiKey(
  request: Request,
  requiredScope?: string,
  requiredEnvironment?: BalmzApiEnvironment,
): Promise<AuthenticatedApiKey | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer (balmz_(demo|live)_[A-Za-z0-9_-]{40,64})$/);
  if (!match) return null;
  const token = match[1];
  const environment = match[2] as BalmzApiEnvironment;
  if (requiredEnvironment && requiredEnvironment !== environment) return null;

  const keyPrefix = token.slice(0, 20);
  const keyHash = sha256ApiKey(token);
  const result = await getDbPool().query<{
    id: string;
    name: string;
    environment: BalmzApiEnvironment;
    scopes: string[];
    created_by_user_id: string | null;
  }>(
    `SELECT id, name, environment, scopes, created_by_user_id
       FROM public.balmz_api_keys
      WHERE key_prefix = $1
        AND key_hash = $2
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > now())
      LIMIT 1`,
    [keyPrefix, keyHash],
  );
  const key = result.rows[0];
  if (!key || key.environment !== environment) return null;
  if (requiredScope && !key.scopes.includes("*") && !key.scopes.includes(requiredScope)) return null;

  void getDbPool().query(
    "UPDATE public.balmz_api_keys SET last_used_at = now() WHERE id = $1",
    [key.id],
  ).catch(() => undefined);

  return {
    id: key.id,
    name: key.name,
    environment: key.environment,
    scopes: key.scopes,
    createdByUserId: key.created_by_user_id,
  };
}
