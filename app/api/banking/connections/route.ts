import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  try {
    const result = await getDbPool().query<{
      id: string; institution_name: string; environment: string; status: string; created_at: string;
      account_id: string | null; name: string | null; account_type: string | null; account_subtype: string | null; mask: string | null;
    }>(
      "SELECT i.id, i.institution_name, i.environment, i.status, i.created_at, a.account_id, a.name, a.account_type, a.account_subtype, a.mask FROM public.balmz_plaid_items i LEFT JOIN public.balmz_plaid_accounts a ON a.plaid_item_id = i.id AND a.user_id = i.user_id WHERE i.user_id = $1 AND i.status <> 'disconnected' ORDER BY i.created_at DESC, a.name",
      [session.user.id],
    );
    const items = new Map<string, { id: string; institutionName: string; environment: string; status: string; createdAt: string; accounts: Array<{ id: string; name: string; type: string | null; subtype: string | null; mask: string | null }> }>();
    for (const row of result.rows) {
      let item = items.get(row.id);
      if (!item) {
        item = { id: row.id, institutionName: row.institution_name, environment: row.environment, status: row.status, createdAt: row.created_at, accounts: [] };
        items.set(row.id, item);
      }
      if (row.account_id) item.accounts.push({ id: row.account_id, name: row.name ?? "Bank account", type: row.account_type, subtype: row.account_subtype, mask: row.mask });
    }
    return NextResponse.json({ connections: [...items.values()] }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "BANKING_SCHEMA_REQUIRED", message: "Apply BALMZ AI bank migrations 0009 and 0010 first." }, { status: 503, headers: noStore });
    return NextResponse.json({ error: "BANK_CONNECTIONS_UNAVAILABLE", message: "Bank connections could not be loaded." }, { status: 503, headers: noStore });
  }
}
