import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { getMoneyMovementAccessToken, getMoneyMovementEnvironment, moneyMovementRequest } from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const TERMS_VERSION = "BALMZ-BANKING-CONSENT-2026-11-16";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  try {
    const result = await getDbPool().query<{ id: string; environment: string; customer_type: string; provider_status: string; consent_accepted_at: string }>(
      "SELECT id, environment, customer_type, provider_status, consent_accepted_at FROM public.balmz_money_movement_customers WHERE user_id = $1 LIMIT 1",
      [session.user.id],
    );
    return NextResponse.json({ customer: result.rows[0] ?? null }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "BANKING_SCHEMA_REQUIRED" }, { status: 503, headers: noStore });
    return NextResponse.json({ error: "BANKING_CUSTOMER_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore });
  let body: { acceptedTerms?: unknown; acceptedDataSharing?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (body.acceptedTerms !== true || body.acceptedDataSharing !== true) {
    return NextResponse.json({ error: "CONSENT_REQUIRED", message: "Review the bank-transfer profile notice and Plaid data-sharing notice, then confirm both before continuing." }, { status: 400, headers: noStore });
  }
  if (!session.user.email || !session.user.name?.trim()) {
    return NextResponse.json({ error: "PROFILE_NAME_REQUIRED", message: "Add your full first and last name in account settings before setting up bank transfers." }, { status: 400, headers: noStore });
  }

  const environment = getMoneyMovementEnvironment();
  if (environment === "live" && process.env.NMI_CUSTOMER_KYC_AND_DISCLOSURE_APPROVED !== "true") {
    return NextResponse.json({ error: "PRODUCTION_CUSTOMER_APPROVAL_REQUIRED", message: "Production bank-transfer profiles are disabled until NMI approves BALMZ AI's customer verification and disclosure requirements." }, { status: 403, headers: noStore });
  }

  try {
    const existing = await getDbPool().query<{ id: string; customer_url: string; environment: string; customer_type: string; provider_status: string }>(
      "SELECT id, customer_url, environment, customer_type, provider_status FROM public.balmz_money_movement_customers WHERE user_id = $1 LIMIT 1",
      [session.user.id],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.environment !== environment) return NextResponse.json({ error: "CUSTOMER_ENVIRONMENT_MISMATCH", message: "This account already has a Money Movement customer in another environment. Contact support before changing it." }, { status: 409, headers: noStore });
      return NextResponse.json({ success: true, status: row.provider_status, customerType: row.customer_type, message: "Your bank-transfer profile is already set up." }, { headers: noStore });
    }

    const parts = session.user.name.trim().split(/\s+/);
    if (parts.length < 2) return NextResponse.json({ error: "PROFILE_NAME_REQUIRED", message: "Add your first and last name before continuing." }, { status: 400, headers: noStore });
    const token = await getMoneyMovementAccessToken(environment);
    const created = await moneyMovementRequest<Record<string, unknown>>(environment, token, "POST", "/customers", {
      firstName: parts.shift()!.slice(0, 50),
      lastName: parts.join(" ").slice(0, 50),
      email: session.user.email,
      type: "unverified",
      correlationId: "balmz-" + session.user.id.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 220),
    });
    if (!created.location) throw new Error("MONEY_MOVEMENT_CUSTOMER_LOCATION_MISSING");
    const customerUrl = new URL(created.location);
    if (customerUrl.protocol !== "https:" || !customerUrl.hostname.endsWith("dwolla.com") || !customerUrl.pathname.startsWith("/customers/")) {
      throw new Error("MONEY_MOVEMENT_CUSTOMER_LOCATION_INVALID");
    }
    const id = randomUUID();
    await getDbPool().query(
      "INSERT INTO public.balmz_money_movement_customers (id, user_id, customer_url, environment, customer_type, provider_status, terms_version, terms_accepted_at) VALUES ($1, $2, $3, $4, 'unverified', 'created', $5, now())",
      [id, session.user.id, created.location, environment, TERMS_VERSION],
    );
    await getDbPool().query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'money_movement_customer_created', $3::jsonb)",
      [randomUUID(), session.user.id, JSON.stringify({ environment, customerType: "unverified", termsVersion: TERMS_VERSION })],
    ).catch(() => undefined);
    return NextResponse.json({ success: true, status: "created", customerType: "unverified", message: "Your bank-linking profile was created. Link a checking or savings account to add an ACH funding source." }, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return NextResponse.json({ error: "BANKING_SCHEMA_REQUIRED", message: "Apply the BALMZ AI banking migration first." }, { status: 503, headers: noStore });
    const code = error instanceof Error ? error.message : "MONEY_MOVEMENT_CUSTOMER_FAILED";
    const message = code === "MONEY_MOVEMENT_NOT_CONFIGURED" ? "NMI Money Movement Sandbox credentials are not configured in the Admin Secret Vault."
      : code.includes("CREDENTIAL_REJECTED") ? "NMI Money Movement rejected its saved credentials."
      : "Your bank-linking profile could not be created. Please try again.";
    return NextResponse.json({ error: code, message }, { status: 502, headers: noStore });
  }
}
