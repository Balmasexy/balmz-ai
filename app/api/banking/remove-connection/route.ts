import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { decryptProviderKey } from "@/lib/ai/providers";
import { getMoneyMovementAccessToken, getPlaidCredentials, moneyMovementRequest, plaidRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { connectionId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.connectionId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.connectionId)) {
    return NextResponse.json({ error: "INVALID_CONNECTION", message: "Choose a linked bank connection." }, { status: 400, headers: noStore });
  }
  try {
    const result = await getDbPool().query<{
      id: string; encrypted_access_token: string; environment: "demo" | "live";
    }>(
      "SELECT id, encrypted_access_token, environment FROM public.balmz_plaid_items WHERE id = $1 AND user_id = $2 AND status <> 'disconnected' LIMIT 1",
      [body.connectionId, session.user.id],
    );
    const item = result.rows[0];
    if (!item) return NextResponse.json({ error: "CONNECTION_NOT_FOUND" }, { status: 404, headers: noStore });

    const sources = await getDbPool().query<{ id: string; funding_source_url: string; environment: "demo" | "live" }>(
      "SELECT id, funding_source_url, environment FROM public.balmz_money_movement_funding_sources WHERE plaid_item_id = $1 AND user_id = $2 AND removed_at IS NULL",
      [item.id, session.user.id],
    );
    const tokenByEnvironment = new Map<string, string>();
    for (const source of sources.rows) {
      let token = tokenByEnvironment.get(source.environment);
      if (!token) {
        token = await getMoneyMovementAccessToken(source.environment);
        tokenByEnvironment.set(source.environment, token);
      }
      const sourceId = source.funding_source_url.split("/").filter(Boolean).pop();
      if (!sourceId) throw new Error("MONEY_MOVEMENT_INVALID_FUNDING_SOURCE");
      await moneyMovementRequest(source.environment, token, "DELETE", "/funding-sources/" + encodeURIComponent(sourceId));
      await getDbPool().query(
        "UPDATE public.balmz_money_movement_funding_sources SET provider_status = 'removed', ach_enabled = false, removed_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2",
        [source.id, session.user.id],
      );
    }

    const stored = JSON.parse(decryptProviderKey(item.encrypted_access_token)) as { accessToken?: string };
    if (stored.accessToken) {
      const plaidCredentials = await getPlaidCredentials(item.environment);
      await plaidRequest(item.environment, plaidCredentials, "/item/remove", { access_token: stored.accessToken });
    }
    await getDbPool().query(
      "UPDATE public.balmz_plaid_items SET status = 'disconnected', encrypted_access_token = '', disconnected_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2",
      [item.id, session.user.id],
    );

    await getDbPool().query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'plaid_bank_disconnected', $3::jsonb)",
      [randomUUID(), session.user.id, JSON.stringify({ connectionId: item.id })],
    ).catch(() => undefined);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BANK_DISCONNECT_FAILED";
    const message = code === "MONEY_MOVEMENT_NOT_CONFIGURED"
      ? "The ACH funding source must be removed first, but NMI Money Movement is not configured. Contact support to finish disconnecting this connection."
      : "The bank connection could not be removed. Please try again.";
    return NextResponse.json({ error: code, message }, { status: 502, headers: noStore });
  }
}
