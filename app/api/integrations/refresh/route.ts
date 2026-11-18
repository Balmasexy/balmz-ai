import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { refreshCustomerOAuthConnection } from "@/lib/integrations/customer-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  let body: { connectionId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (typeof body.connectionId !== "string" || body.connectionId.length > 100) return NextResponse.json({ error: "INVALID_CONNECTION_ID" }, { status: 400 });
  try {
    const result = await refreshCustomerOAuthConnection(session.user.id, body.connectionId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OAUTH_REFRESH_FAILED";
    const safeCode = ["OAUTH_CONNECTION_NOT_FOUND", "OAUTH_REAUTH_REQUIRED", "OAUTH_PROVIDER_NOT_CONFIGURED", "OAUTH_REFRESH_FAILED", "OAUTH_REFRESH_UNAVAILABLE"].includes(code) ? code : "OAUTH_REFRESH_FAILED";
    const status = safeCode === "OAUTH_CONNECTION_NOT_FOUND" ? 404 : safeCode === "OAUTH_REAUTH_REQUIRED" ? 409 : 503;
    return NextResponse.json({ error: safeCode, message: safeCode === "OAUTH_REAUTH_REQUIRED" ? "Reconnect this account to restore its authorization." : "The account authorization could not be refreshed." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
