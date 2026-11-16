import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPlaidCredentials, getPlaidEnvironment, plaidRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  const environment = getPlaidEnvironment();
  try {
    const credentials = await getPlaidCredentials(environment);
    const redirectUri = process.env.PLAID_REDIRECT_URI?.trim();
    const result = await plaidRequest<{ link_token: string; expiration: string }>(environment, credentials, "/link/token/create", {
      user: { client_user_id: session.user.id },
      client_name: "BALMZ AI",
      products: ["auth"],
      country_codes: ["US"],
      language: "en",
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });
    return NextResponse.json({
      linkToken: result.link_token,
      expiration: result.expiration,
      environment: environment === "demo" ? "sandbox" : "production",
      multifactorAuthentication: "Plaid Link handles bank sign-in and verification codes.",
    }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BANK_LINK_TOKEN_FAILED";
    const message = code === "PLAID_NOT_CONFIGURED"
      ? "Plaid credentials are not configured in the Admin Secret Vault."
      : "A secure Plaid Link session could not be created. Check the Plaid connection and try again.";
    return NextResponse.json({ error: code, message }, { status: 503, headers: noStore });
  }
}
