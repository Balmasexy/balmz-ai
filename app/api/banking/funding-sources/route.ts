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
      id: string; name: string; institution_name: string; account_type: string;
      account_mask: string | null; provider_status: string; ach_enabled: boolean;
      environment: string; created_at: string;
    }>(
      "SELECT id, name, institution_name, account_type, account_mask, provider_status, ach_enabled, environment, created_at FROM public.balmz_money_movement_funding_sources WHERE user_id = $1 AND removed_at IS NULL ORDER BY created_at DESC",
      [session.user.id],
    );
    return NextResponse.json({
      fundingSources: result.rows.map((row) => ({
        id: row.id, name: row.name, institutionName: row.institution_name,
        accountType: row.account_type, mask: row.account_mask, status: row.provider_status,
        achEnabled: row.ach_enabled, environment: row.environment, createdAt: row.created_at,
      })),
      transfersEnabled: false,
      message: "ACH funding-source status is separate from money-transfer approval.",
    }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "BANKING_SCHEMA_REQUIRED", message: "Apply BALMZ AI banking migration 0009 first." }, { status: 503, headers: noStore });
    return NextResponse.json({ error: "FUNDING_SOURCES_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
