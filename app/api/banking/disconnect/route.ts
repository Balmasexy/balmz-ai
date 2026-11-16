import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { getMoneyMovementAccessToken, moneyMovementRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { fundingSourceId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.fundingSourceId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.fundingSourceId)) {
    return NextResponse.json({ error: "INVALID_FUNDING_SOURCE" }, { status: 400, headers: noStore });
  }
  try {
    const result = await getDbPool().query<{ id: string; funding_source_url: string; environment: "demo" | "live" }>(
      "SELECT id, funding_source_url, environment FROM public.balmz_money_movement_funding_sources WHERE id = $1 AND user_id = $2 AND removed_at IS NULL LIMIT 1",
      [body.fundingSourceId, session.user.id],
    );
    const source = result.rows[0];
    if (!source) return NextResponse.json({ error: "FUNDING_SOURCE_NOT_FOUND" }, { status: 404, headers: noStore });
    const sourceId = source.funding_source_url.split("/").filter(Boolean).pop();
    if (!sourceId) throw new Error("MONEY_MOVEMENT_INVALID_FUNDING_SOURCE");
    const token = await getMoneyMovementAccessToken(source.environment);
    await moneyMovementRequest(source.environment, token, "DELETE", "/funding-sources/" + encodeURIComponent(sourceId));
    await getDbPool().query(
      "UPDATE public.balmz_money_movement_funding_sources SET provider_status = 'removed', ach_enabled = false, removed_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2",
      [source.id, session.user.id],
    );
    await getDbPool().query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'bank_funding_source_removed', $3::jsonb)",
      [randomUUID(), session.user.id, JSON.stringify({ fundingSourceId: source.id })],
    ).catch(() => undefined);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FUNDING_SOURCE_REMOVE_FAILED";
    return NextResponse.json({ error: code, message: code === "MONEY_MOVEMENT_NOT_CONFIGURED" ? "NMI Money Movement is not configured." : "The linked funding source could not be removed." }, { status: 502, headers: noStore });
  }
}
