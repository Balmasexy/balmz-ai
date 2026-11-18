import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import {
  buildCustomerOAuthCallbackUrl,
  completeCustomerOAuthConnection,
  decryptCustomerOAuthValue,
  hashCustomerOAuthState,
  getCustomerOAuthProvider,
} from "@/lib/integrations/customer-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

function redirectToConnections(request: Request, query: Record<string, string>) {
  const baseUrl = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || "https://balmz-ai.onrender.com";
  const target = new URL("/dashboard/connections", baseUrl);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return NextResponse.redirect(target, 303);
}

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/sign-in?next=%2Fdashboard%2Fconnections", request.url), 303);

  const { provider: providerId } = await context.params;
  if (!getCustomerOAuthProvider(providerId)) return redirectToConnections(request, { error: "unsupported_provider" });
  const url = new URL(request.url);
  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (providerError || !code || !state || state.length > 256) {
    return redirectToConnections(request, { error: providerError ? "provider_authorization_denied" : "invalid_callback" });
  }

  try {
    const consumed = await getDbPool().query<{
      encrypted_code_verifier: string;
    }>(
      `UPDATE public.balmz_customer_oauth_states
          SET consumed_at = now()
        WHERE state_hash = $1 AND user_id = $2 AND provider_id = $3
          AND consumed_at IS NULL AND expires_at > now()
        RETURNING encrypted_code_verifier`,
      [hashCustomerOAuthState(state), session.user.id, providerId],
    );
    const stateRow = consumed.rows[0];
    if (!stateRow) return redirectToConnections(request, { error: "oauth_state_expired_or_invalid" });
    const codeVerifier = decryptCustomerOAuthValue(stateRow.encrypted_code_verifier);
    const baseUrl = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || "https://balmz-ai.onrender.com";
    await completeCustomerOAuthConnection({
      userId: session.user.id,
      providerId,
      code,
      codeVerifier,
      redirectUri: buildCustomerOAuthCallbackUrl(providerId, baseUrl),
    });
    return redirectToConnections(request, { connected: providerId });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return redirectToConnections(request, { error: "customer_connection_schema_required" });
    }
    const code = error instanceof Error ? error.message : "oauth_connection_failed";
    const safeCode = /^[A-Z0-9_]{1,64}$/.test(code) ? code.toLowerCase() : "oauth_connection_failed";
    return redirectToConnections(request, { error: safeCode });
  }
}
