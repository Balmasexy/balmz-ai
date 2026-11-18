import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import {
  buildCustomerOAuthAuthorizationUrl,
  createCustomerOAuthPkceChallenge,
  createCustomerOAuthPkceVerifier,
  createCustomerOAuthState,
  encryptCustomerOAuthValue,
  getCustomerOAuthCredentials,
  getCustomerOAuthProvider,
  hashCustomerOAuthState,
} from "@/lib/integrations/customer-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED", message: "Sign in before connecting an account." }, { status: 401 });

  const { provider: providerId } = await context.params;
  const provider = getCustomerOAuthProvider(providerId);
  if (!provider) return NextResponse.json({ error: "OAUTH_PROVIDER_UNSUPPORTED" }, { status: 404 });
  const credentials = getCustomerOAuthCredentials(providerId);
  if (!credentials) return NextResponse.json({
    error: "OAUTH_PROVIDER_NOT_CONFIGURED",
    message: provider.label + " OAuth credentials are not configured on the BALMZ AI Render service yet.",
  }, { status: 503, headers: { "Cache-Control": "no-store" } });

  const baseUrl = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || "https://balmz-ai.onrender.com";
  const state = createCustomerOAuthState();
  const verifier = createCustomerOAuthPkceVerifier();
  const challenge = createCustomerOAuthPkceChallenge(verifier);
  const encryptedVerifier = encryptCustomerOAuthValue(verifier);
  try {
    await getDbPool().query(
      "DELETE FROM public.balmz_customer_oauth_states WHERE expires_at < now() OR consumed_at IS NOT NULL",
    );
    await getDbPool().query(
      `INSERT INTO public.balmz_customer_oauth_states
         (state_hash, user_id, provider_id, encrypted_code_verifier, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '10 minutes')`,
      [hashCustomerOAuthState(state), session.user.id, providerId, encryptedVerifier],
    );
    const authorizationUrl = buildCustomerOAuthAuthorizationUrl(providerId, {
      state,
      codeChallenge: provider.usePkce ? challenge : undefined,
      baseUrl,
      clientId: credentials.clientId,
    });
    return NextResponse.redirect(authorizationUrl, 302);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({
        error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED",
        message: "Customer connections require the additive BALMZ AI database migrations 0011 and 0012.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "OAUTH_START_FAILED",
      message: "The account authorization flow could not be started.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
