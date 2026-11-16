import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { encryptProviderKey } from "@/lib/ai/providers";
import { getPlaidCredentials, getPlaidEnvironment, plaidRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

type Institution = { institution_id?: string; name?: string };
type AccountSelection = { id?: string; type?: string; subtype?: string };

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { publicToken?: unknown; account?: unknown; institution?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.publicToken !== "string" || body.publicToken.length < 20 || body.publicToken.length > 512 || !body.publicToken.startsWith("public-")) {
    return NextResponse.json({ error: "INVALID_PUBLIC_TOKEN", message: "Plaid did not return a valid bank-link token." }, { status: 400, headers: noStore });
  }
  const account = body.account && typeof body.account === "object" ? body.account as AccountSelection : {};
  const institution = body.institution && typeof body.institution === "object" ? body.institution as Institution : {};
  if (typeof account.id !== "string" || account.id.length < 5 || account.id.length > 128) return NextResponse.json({ error: "BANK_ACCOUNT_REQUIRED", message: "Choose one bank account in Plaid Link." }, { status: 400, headers: noStore });

  const environment = getPlaidEnvironment();
  try {
    const credentials = await getPlaidCredentials(environment);
    const exchanged = await plaidRequest<{ access_token: string; item_id: string }>(environment, credentials, "/item/public_token/exchange", { public_token: body.publicToken });
    if (!exchanged.access_token || !exchanged.item_id) throw new Error("PLAID_INVALID_RESPONSE");

    const accountData = await plaidRequest<{ accounts?: Array<{
      account_id: string; name: string; official_name?: string | null; type: string; subtype?: string | null; mask?: string | null;
    }> }>(environment, credentials, "/accounts/get", { access_token: exchanged.access_token });
    const selectedAccount = accountData.accounts?.find((entry) => entry.account_id === account.id);
    if (!selectedAccount || selectedAccount.type !== "depository" || !["checking", "savings"].includes(selectedAccount.subtype || "")) {
      throw new Error("PLAID_ACCOUNT_SELECTION_INVALID");
    }

    const institutionName = typeof institution.name === "string" && institution.name.trim()
      ? institution.name.trim().slice(0, 120)
      : "Connected bank";
    const encryptedToken = encryptProviderKey(JSON.stringify({ accessToken: exchanged.access_token }));
    const itemRecordId = randomUUID();
    const db = getDbPool();
    const client = await db.connect();
    let savedItemId = "";
    try {
      await client.query("BEGIN");
      const item = await client.query<{ id: string }>(
        "INSERT INTO public.balmz_plaid_items (id, user_id, item_id, encrypted_access_token, environment, institution_id, institution_name, status) VALUES ($1, $2, $3, $4, $5, $6, $7, 'connected') ON CONFLICT (item_id) DO UPDATE SET encrypted_access_token = EXCLUDED.encrypted_access_token, status = 'connected', institution_name = EXCLUDED.institution_name, updated_at = now(), disconnected_at = NULL WHERE public.balmz_plaid_items.user_id = EXCLUDED.user_id RETURNING id",
        [itemRecordId, session.user.id, exchanged.item_id, encryptedToken, environment, typeof institution.institution_id === "string" ? institution.institution_id.slice(0, 128) : null, institutionName],
      );
      if (!item.rowCount) throw new Error("PLAID_ITEM_ALREADY_LINKED");
      savedItemId = item.rows[0].id;
      await client.query(
        "INSERT INTO public.balmz_plaid_accounts (id, user_id, plaid_item_id, account_id, name, official_name, account_type, account_subtype, mask, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) ON CONFLICT (plaid_item_id, account_id) DO UPDATE SET name = EXCLUDED.name, official_name = EXCLUDED.official_name, account_type = EXCLUDED.account_type, account_subtype = EXCLUDED.account_subtype, mask = EXCLUDED.mask, updated_at = now()",
        [randomUUID(), session.user.id, savedItemId, selectedAccount.account_id, selectedAccount.name.slice(0, 160), selectedAccount.official_name?.slice(0, 160) ?? null, selectedAccount.type, selectedAccount.subtype ?? null, selectedAccount.mask?.slice(0, 8) ?? null],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }

    await db.query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'plaid_bank_connected', $3::jsonb)",
      [randomUUID(), session.user.id, JSON.stringify({ itemId: savedItemId, environment, institutionName })],
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      connectionId: savedItemId,
      institutionName,
      selectedAccount: { name: selectedAccount.name, subtype: selectedAccount.subtype, mask: selectedAccount.mask ?? null },
      message: "Bank sign-in and MFA completed inside Plaid Link. The selected account is securely connected. ACH funding-source setup is a separate step.",
    }, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "BANKING_SCHEMA_REQUIRED", message: "Apply BALMZ AI bank migrations 0009 and 0010 first." }, { status: 503, headers: noStore });
    const code = error instanceof Error ? error.message : "BANK_CONNECTION_FAILED";
    const message = code === "PLAID_NOT_CONFIGURED" ? "Plaid credentials are not configured in the Admin Secret Vault."
      : code === "PLAID_ITEM_ALREADY_LINKED" ? "This bank connection is already linked to a BALMZ AI account."
      : code.startsWith("PLAID_") ? "Plaid could not complete this request. Check your bank selection and try again."
      : "The bank could not be connected. Try again or contact support.";
    return NextResponse.json({ error: code, message }, { status: 502, headers: noStore });
  }
}
