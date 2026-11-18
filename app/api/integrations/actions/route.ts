import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import {
  executeCustomerAccountAction,
  listCustomerAccountActions,
} from "@/lib/integrations/customer-account-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function currentUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  try {
    const result = await getDbPool().query<{
      id: string; provider_id: string; display_name: string; email: string | null;
      status: string; token_expires_at: string | null; last_verified_at: string | null;
    }>(
      `SELECT id, provider_id, display_name, email, status, token_expires_at, last_verified_at
         FROM public.balmz_customer_oauth_connections
        WHERE user_id = $1 AND status = 'connected'
        ORDER BY provider_id, display_name`,
      [user.id],
    );
    return NextResponse.json({
      connections: result.rows.map((row) => ({
        id: row.id,
        providerId: row.provider_id,
        displayName: row.display_name,
        email: row.email,
        status: row.status,
        expiresAt: row.token_expires_at,
        lastVerifiedAt: row.last_verified_at,
        actions: listCustomerAccountActions(row.provider_id),
      })),
    }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED", message: "Apply the reviewed customer-connection migration before using provider actions." }, { status: 503, headers: noStore });
    }
    return NextResponse.json({ error: "CUSTOMER_ACTIONS_UNAVAILABLE", message: "Your account actions could not be loaded." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { connectionId?: unknown; actionId?: unknown; query?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.connectionId !== "string" || body.connectionId.length > 100 ||
      typeof body.actionId !== "string" || body.actionId.length > 100 ||
      body.query !== undefined && typeof body.query !== "string") {
    return NextResponse.json({ error: "INVALID_ACTION_REQUEST" }, { status: 400, headers: noStore });
  }
  try {
    const result = await executeCustomerAccountAction({
      userId: user.id,
      connectionId: body.connectionId,
      actionId: body.actionId,
      query: typeof body.query === "string" ? body.query : "",
    });
    return NextResponse.json(result, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED" }, { status: 503, headers: noStore });
    }
    const code = error instanceof Error ? error.message : "CUSTOMER_ACTION_FAILED";
    const status = code === "CUSTOMER_CONNECTION_NOT_FOUND" ? 404
      : code === "CUSTOMER_ACTION_QUERY_REQUIRED" ? 400
        : code === "CUSTOMER_CONNECTION_REAUTH_REQUIRED" ? 409
          : code === "CUSTOMER_ACTION_NOT_ALLOWED" ? 403
            : code === "CUSTOMER_PROVIDER_RATE_LIMITED" ? 429
              : 502;
    const safeCode = [
      "CUSTOMER_CONNECTION_NOT_FOUND",
      "CUSTOMER_ACTION_QUERY_REQUIRED",
      "CUSTOMER_CONNECTION_REAUTH_REQUIRED",
      "CUSTOMER_ACTION_NOT_ALLOWED",
      "CUSTOMER_ACTION_RESULT_TOO_LARGE",
      "CUSTOMER_CONNECTION_TOKEN_INVALID",
      "CUSTOMER_PROVIDER_RATE_LIMITED",
      "CUSTOMER_PROVIDER_UNAVAILABLE",
      "CUSTOMER_PROVIDER_REQUEST_FAILED",
    ].includes(code) ? code : "CUSTOMER_ACTION_FAILED";
    return NextResponse.json({
      error: safeCode,
      message: safeCode === "CUSTOMER_CONNECTION_REAUTH_REQUIRED"
        ? "This account needs authorization again. Refresh the connection or reconnect the provider."
        : safeCode === "CUSTOMER_ACTION_QUERY_REQUIRED"
          ? "Enter a search term before running this action."
          : safeCode === "CUSTOMER_ACTION_NOT_ALLOWED"
            ? "That action is not enabled for this provider."
            : "The selected provider action could not be completed.",
    }, { status, headers: noStore });
  }
}
