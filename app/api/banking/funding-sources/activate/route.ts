import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { decryptProviderKey } from "@/lib/ai/providers";
import { getMoneyMovementAccessToken, getMoneyMovementEnvironment, getPlaidCredentials, getPlaidEnvironment, moneyMovementRequest, plaidRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { connectionId?: unknown; accountId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.connectionId !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.connectionId) ||
      typeof body.accountId !== "string" || body.accountId.length < 5 || body.accountId.length > 128) {
    return NextResponse.json({ error: "INVALID_ACCOUNT_SELECTION", message: "Choose a bank connection and selected account." }, { status: 400, headers: noStore });
  }

  const environment = getPlaidEnvironment();
  if (environment !== getMoneyMovementEnvironment()) return NextResponse.json({ error: "BANKING_ENVIRONMENT_MISMATCH", message: "Plaid and NMI Money Movement must use the same environment." }, { status: 409, headers: noStore });
  if (environment === "live" && (process.env.NMI_MONEY_MOVEMENT_LIVE_APPROVED !== "true" || process.env.NMI_CUSTOMER_KYC_AND_DISCLOSURE_APPROVED !== "true")) {
    return NextResponse.json({ error: "PRODUCTION_ACH_APPROVAL_REQUIRED", message: "Production ACH funding-source setup is disabled until NMI issues written go-live approval and approves the required customer verification and disclosures." }, { status: 403, headers: noStore });
  }

  try {
    const [itemResult, customerResult] = await Promise.all([
      getDbPool().query<{ id: string; encrypted_access_token: string; institution_name: string; environment: string }>(
        "SELECT i.id, i.encrypted_access_token, i.institution_name, i.environment FROM public.balmz_plaid_items i JOIN public.balmz_plaid_accounts a ON a.plaid_item_id = i.id AND a.user_id = i.user_id WHERE i.id = $1 AND i.user_id = $2 AND a.account_id = $3 AND i.status = 'connected' LIMIT 1",
        [body.connectionId, session.user.id, body.accountId],
      ),
      getDbPool().query<{ id: string; customer_url: string; environment: string }>(
        "SELECT id, customer_url, environment FROM public.balmz_money_movement_customers WHERE user_id = $1 LIMIT 1",
        [session.user.id],
      ),
    ]);
    const item = itemResult.rows[0];
    const customer = customerResult.rows[0];
    if (!item) return NextResponse.json({ error: "BANK_ACCOUNT_NOT_FOUND", message: "That selected bank account is not attached to your BALMZ AI profile." }, { status: 404, headers: noStore });
    if (!customer) return NextResponse.json({ error: "TRANSFER_PROFILE_REQUIRED", message: "Create your ACH transfer profile first." }, { status: 409, headers: noStore });
    if (item.environment !== environment || customer.environment !== environment) return NextResponse.json({ error: "BANKING_ENVIRONMENT_MISMATCH" }, { status: 409, headers: noStore });

    const duplicate = await getDbPool().query<{ id: string }>(
      "SELECT id FROM public.balmz_money_movement_funding_sources WHERE user_id = $1 AND plaid_item_id = $2 AND removed_at IS NULL LIMIT 1",
      [session.user.id, item.id],
    );
    if (duplicate.rows[0]) return NextResponse.json({ error: "FUNDING_SOURCE_ALREADY_EXISTS", message: "This bank connection already has a funding source. Refresh the page to see its status." }, { status: 409, headers: noStore });

    const stored = JSON.parse(decryptProviderKey(item.encrypted_access_token)) as { accessToken?: string };
    if (!stored.accessToken) throw new Error("PLAID_ACCESS_TOKEN_MISSING");
    const plaidCredentials = await getPlaidCredentials(environment);
    const processor = await plaidRequest<{ processor_token: string }>(environment, plaidCredentials, "/processor/token/create", {
      access_token: stored.accessToken,
      account_id: body.accountId,
      processor: "dwolla",
    });
    if (!processor.processor_token) throw new Error("PLAID_PROCESSOR_TOKEN_MISSING");

    const movementToken = await getMoneyMovementAccessToken(environment);
    const customerId = customer.customer_url.split("/").filter(Boolean).pop();
    if (!customerId) throw new Error("MONEY_MOVEMENT_CUSTOMER_INVALID");
    const accountResult = await getDbPool().query<{ name: string; account_subtype: string; mask: string | null }>(
      "SELECT name, account_subtype, mask FROM public.balmz_plaid_accounts WHERE plaid_item_id = $1 AND user_id = $2 AND account_id = $3 LIMIT 1",
      [item.id, session.user.id, body.accountId],
    );
    const bankAccount = accountResult.rows[0];
    if (!bankAccount || !["checking", "savings"].includes(bankAccount.account_subtype || "")) {
      return NextResponse.json({ error: "INELIGIBLE_BANK_ACCOUNT", message: "Only checking and savings accounts can be added for ACH." }, { status: 400, headers: noStore });
    }

    const created = await moneyMovementRequest<Record<string, unknown>>(
      environment, movementToken, "POST",
      "/customers/" + encodeURIComponent(customerId) + "/funding-sources",
      { plaidToken: processor.processor_token, name: (item.institution_name + " " + bankAccount.name).slice(0, 100) },
    );
    if (!created.location) throw new Error("MONEY_MOVEMENT_FUNDING_SOURCE_LOCATION_MISSING");
    const sourceId = created.location.split("/").filter(Boolean).pop();
    if (!sourceId) throw new Error("MONEY_MOVEMENT_FUNDING_SOURCE_LOCATION_INVALID");

    let providerStatus = "pending";
    try {
      const status = await moneyMovementRequest<{ status?: string }>(environment, movementToken, "GET", "/funding-sources/" + encodeURIComponent(sourceId));
      if (typeof status.data?.status === "string") providerStatus = status.data.status.toLowerCase();
    } catch { providerStatus = "pending"; }
    const achEnabled = providerStatus === "verified";
    const fundingId = randomUUID();
    await getDbPool().query(
      "INSERT INTO public.balmz_money_movement_funding_sources (id, user_id, customer_id, plaid_item_id, funding_source_url, name, institution_name, account_type, account_mask, environment, provider_status, ach_enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
      [fundingId, session.user.id, customer.id, item.id, created.location, bankAccount.name, item.institution_name, bankAccount.account_subtype, bankAccount.mask, environment, providerStatus === "verified" ? "verified" : "pending", achEnabled],
    );
    await getDbPool().query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'ach_funding_source_activated', $3::jsonb)",
      [randomUUID(), session.user.id, JSON.stringify({ fundingSourceId: fundingId, environment, status: providerStatus })],
    ).catch(() => undefined);
    return NextResponse.json({
      success: true, fundingSourceId: fundingId, status: providerStatus, achVerified: achEnabled, transfersEnabled: false,
      message: achEnabled ? "The ACH funding source was created and verified by the provider." : "The ACH funding source was created. The provider has not yet confirmed its verification status.",
    }, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "BANKING_SCHEMA_REQUIRED", message: "Apply the BALMZ AI banking migrations first." }, { status: 503, headers: noStore });
    const code = error instanceof Error ? error.message : "ACH_FUNDING_SOURCE_FAILED";
    const message = code === "PLAID_NOT_CONFIGURED" || code === "MONEY_MOVEMENT_NOT_CONFIGURED" ? "Plaid and NMI Money Movement credentials must both be saved in the Super Admin Secret Vault."
      : code.includes("CREDENTIAL_REJECTED") ? "The provider rejected its credentials."
      : code.startsWith("PLAID_") || code.startsWith("MONEY_MOVEMENT_") ? "The provider could not create the ACH funding source. Check the provider settings and try again."
      : "The ACH funding source could not be created.";
    return NextResponse.json({ error: code, message }, { status: 502, headers: noStore });
  }
}
