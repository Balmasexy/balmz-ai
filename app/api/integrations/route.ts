import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import {
  getCustomerOAuthProviderStatus,
  revokeCustomerOAuthAccess,
} from "@/lib/integrations/customer-oauth";

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
      id: string; provider_id: string; provider_account_id: string; display_name: string;
      email: string | null; scopes: string[]; token_expires_at: string | null;
      status: string; last_verified_at: string | null; created_at: string;
    }>(
      `SELECT id, provider_id, provider_account_id, display_name, email, scopes,
              token_expires_at, status, last_verified_at, created_at
         FROM public.balmz_customer_oauth_connections
        WHERE user_id = $1 AND status <> 'disconnected'
        ORDER BY provider_id, created_at DESC`,
      [user.id],
    );
    return NextResponse.json({
      providers: getCustomerOAuthProviderStatus(),
      connections: result.rows.map((row) => ({
        id: row.id,
        providerId: row.provider_id,
        accountId: row.provider_account_id,
        displayName: row.display_name,
        email: row.email,
        scopes: row.scopes,
        expiresAt: row.token_expires_at,
        status: row.status,
        lastVerifiedAt: row.last_verified_at,
        createdAt: row.created_at,
      })),
    }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({
        error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED",
        message: "Apply the reviewed additive migrations 0011 and 0012 before using customer-owned connections.",
        providers: getCustomerOAuthProviderStatus(),
        connections: [],
      }, { status: 503, headers: noStore });
    }
    return NextResponse.json({ error: "CUSTOMER_CONNECTIONS_UNAVAILABLE", message: "Your connected accounts could not be loaded." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.id !== "string" || body.id.length > 100) return NextResponse.json({ error: "INVALID_CONNECTION_ID" }, { status: 400, headers: noStore });
  try {
    const selected = await getDbPool().query<{ provider_id: string; encrypted_tokens: string }>(
      "SELECT provider_id, encrypted_tokens FROM public.balmz_customer_oauth_connections WHERE id = $1 AND user_id = $2 LIMIT 1",
      [body.id, user.id],
    );
    const connection = selected.rows[0];
    if (!connection) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404, headers: noStore });
    await revokeCustomerOAuthAccess(connection.provider_id, connection.encrypted_tokens);
    const removed = await getDbPool().query(
      "DELETE FROM public.balmz_customer_oauth_connections WHERE id = $1 AND user_id = $2",
      [body.id, user.id],
    );
    if (!removed.rowCount) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404, headers: noStore });
    return NextResponse.json({ success: true, message: "The saved connection was removed from BALMZ AI." }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "CUSTOMER_CONNECTION_SCHEMA_REQUIRED" }, { status: 503, headers: noStore });
    return NextResponse.json({ error: "CONNECTION_DISCONNECT_FAILED", message: "The selected connection could not be removed." }, { status: 503, headers: noStore });
  }
}
