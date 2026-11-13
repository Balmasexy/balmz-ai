import { getDbPool } from "@/lib/db";
import {
  decryptServiceCredentials,
  serviceCredentialsFromEnvironment,
} from "@/lib/service-connectors";

/**
 * Resolve the Render control-plane credential on the server.
 *
 * Prefer the most recently tested, encrypted Render connection saved by the
 * Super Admin connector workspace. Fall back to RENDER_API_KEY from the
 * BALMZ AI Render service environment for existing installations.
 *
 * This value must never be returned to a client or written to application logs.
 */
export async function getRenderApiToken(): Promise<string> {
  try {
    const result = await getDbPool().query<{ encrypted_credentials: string }>(
      `SELECT encrypted_credentials
         FROM public.balmz_service_credentials
        WHERE service_id = 'render'
          AND environment = 'live'
          AND status = 'connected'
        ORDER BY last_tested_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
    );
    const stored = result.rows[0]
      ? decryptServiceCredentials(result.rows[0].encrypted_credentials).token?.trim()
      : undefined;
    if (stored) return stored;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    // Older installations may not yet have the connector table. In that
    // case the server environment variable remains a supported fallback.
    if (code !== "42P01") throw error;
  }

  const environmentToken = serviceCredentialsFromEnvironment("render", "live")?.token?.trim();
  if (environmentToken) return environmentToken;

  throw new Error("RENDER_NOT_CONFIGURED");
}
