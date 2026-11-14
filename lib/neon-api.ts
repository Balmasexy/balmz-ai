import { getDbPool } from "@/lib/db";
import {
  decryptServiceCredentials,
  serviceCredentialsFromEnvironment,
} from "@/lib/service-connectors";

/** Resolve the connected Neon Management API token without exposing it to callers. */
export async function getNeonApiToken(): Promise<string> {
  try {
    const result = await getDbPool().query<{ encrypted_credentials: string }>(
      \`SELECT encrypted_credentials
         FROM public.balmz_service_credentials
        WHERE service_id = 'neon'
          AND environment = 'live'
          AND status = 'connected'
        ORDER BY last_tested_at DESC NULLS LAST, created_at DESC
        LIMIT 1\`,
    );
    const stored = result.rows[0]
      ? decryptServiceCredentials(result.rows[0].encrypted_credentials).token?.trim()
      : undefined;
    if (stored) return stored;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "42P01") throw error;
  }
  const environmentToken = serviceCredentialsFromEnvironment("neon", "live")?.token?.trim();
  if (environmentToken) return environmentToken;
  throw new Error("NEON_NOT_CONFIGURED");
}

export async function neonApiRequest<T>(token: string, path: string): Promise<T> {
  if (!path.startsWith("/projects") || path.includes("://")) throw new Error("NEON_API_PATH_INVALID");
  let response: Response;
  try {
    response = await fetch("https://console.neon.tech/api/v2" + path, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("NEON_API_UNAVAILABLE");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("NEON_AUTH_FAILED");
    if (response.status === 429) throw new Error("NEON_RATE_LIMITED");
    throw new Error("NEON_HTTP_" + response.status);
  }
  return await response.json() as T;
}
