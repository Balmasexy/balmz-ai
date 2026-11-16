import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getPlaidCredentials, getPlaidEnvironment, plaidRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });

  let body: { platform?: unknown } = {};
  try { body = await request.json(); } catch { /* Web callers may omit a body. */ }
  const isAndroid = body.platform === "android";
  const environment = getPlaidEnvironment();

  try {
    const credentials = await getPlaidCredentials(environment);
    const redirectUri = process.env.PLAID_REDIRECT_URI?.trim();
    const payload: Record<string, unknown> = {
      user: { client_user_id: session.user.id },
      client_name: "BALMZ AI",
      products: ["auth"],
      account_filters: { depository: { account_subtypes: ["checking", "savings"] } },
      country_codes: ["US"],
      language: "en",
    };
    if (isAndroid) {
      // This must match the Android applicationId and be allowlisted in Plaid Dashboard.
      payload.android_package_name = "com.balmz.ai";
    } else if (redirectUri) {
      payload.redirect_uri = redirectUri;
    }

    const result = await plaidRequest<{ link_token: string; expiration: string }>(
      environment, credentials, "/link/token/create", payload,
    );
    return NextResponse.json({
      linkToken: result.link_token,
      expiration: result.expiration,
      environment: environment === "demo" ? "sandbox" : "production",
      platform: isAndroid ? "android" : "web",
      multifactorAuthentication: "Plaid Link handles bank sign-in and verification codes.",
    }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BANK_LINK_TOKEN_FAILED";
    const message = code === "PLAID_NOT_CONFIGURED"
      ? "Plaid credentials are not configured in the Admin Secret Vault."
      : "A secure Plaid Link session could not be created. Check Plaid credentials and confirm that com.balmz.ai is allowlisted for Android in the Plaid Dashboard.";
    return NextResponse.json({ error: code, message }, { status: 503, headers: noStore });
  }
}
