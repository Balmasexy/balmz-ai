import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { decryptProviderKey, encryptProviderKey } from "@/lib/ai/providers";
import {
  testPlaidCredentials,
  testMoneyMovementCredentials,
  type BankingEnvironment,
  type PlaidCredentials,
  type MoneyMovementCredentials,
} from "@/lib/banking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: noStore }), session: null };
  if (!(await isAdminUser(session.user.id))) return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers: noStore }), session: null };
  return { response: null, session };
}

function publicRecord(row: {
  id: string;
  service_id: string;
  display_name: string;
  environment: BankingEnvironment;
  status: string;
  last_tested_at: string | null;
  updated_at: string;
}) {
  return {
    id: row.id,
    provider: row.service_id,
    label: row.display_name,
    environment: row.environment,
    status: row.status,
    lastTestedAt: row.last_tested_at,
    updatedAt: row.updated_at,
  };
}

function schemaRequired() {
  return NextResponse.json({
    error: "BANKING_SCHEMA_REQUIRED",
    message: "Apply db/migrations/0009_plaid_nmi_money_movement.sql before using the banking Secret Vault.",
  }, { status: 503, headers: noStore });
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  try {
    const result = await getDbPool().query<{
      id: string; service_id: string; display_name: string; environment: BankingEnvironment;
      status: string; last_tested_at: string | null; updated_at: string;
    }>(
      "SELECT id, service_id, display_name, environment, status, last_tested_at, updated_at FROM public.balmz_service_credentials WHERE service_id IN ('plaid', 'money-movement') ORDER BY service_id, environment, updated_at DESC",
    );
    return NextResponse.json({
      credentials: result.rows.map(publicRecord),
      productionApprovalRequired: true,
      transfersEnabled: process.env.NMI_MONEY_MOVEMENT_LIVE_APPROVED === "true",
      notice: "Secrets are encrypted and never returned to the app. Production transfers require NMI written go-live approval and production credentials.",
    }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return schemaRequired();
    return NextResponse.json({ error: "BANKING_VAULT_UNAVAILABLE", message: "Banking credentials could not be loaded." }, { status: 503, headers: noStore });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.response || !auth.session) return auth.response;
  let body: {
    action?: unknown; id?: unknown; provider?: unknown; environment?: unknown;
    clientId?: unknown; secret?: unknown; key?: unknown;
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }

  try {
    if (body.action === "test") {
      if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) {
        return NextResponse.json({ error: "INVALID_CREDENTIAL" }, { status: 400, headers: noStore });
      }
      const result = await getDbPool().query<{
        id: string; service_id: "plaid" | "money-movement"; environment: BankingEnvironment;
        encrypted_credentials: string;
      }>(
        "SELECT id, service_id, environment, encrypted_credentials FROM public.balmz_service_credentials WHERE id = $1 AND service_id IN ('plaid', 'money-movement') LIMIT 1",
        [body.id],
      );
      const row = result.rows[0];
      if (!row) return NextResponse.json({ error: "CREDENTIAL_NOT_FOUND" }, { status: 404, headers: noStore });
      const saved = JSON.parse(decryptProviderKey(row.encrypted_credentials)) as Record<string, string>;
      const details = row.service_id === "plaid"
        ? await testPlaidCredentials(row.environment, { clientId: saved.clientId, secret: saved.secret })
        : await testMoneyMovementCredentials(row.environment, { key: saved.key, secret: saved.secret });
      await getDbPool().query(
        "UPDATE public.balmz_service_credentials SET status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now() WHERE id = $1",
        [row.id],
      );
      return NextResponse.json({ success: true, details }, { headers: noStore });
    }

    if (body.action !== "save") return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400, headers: noStore });
    if (body.provider !== "plaid" && body.provider !== "money-movement") {
      return NextResponse.json({ error: "UNKNOWN_PROVIDER" }, { status: 400, headers: noStore });
    }
    const provider = body.provider;
    const environment: BankingEnvironment = body.environment === "live" ? "live" : "demo";
    let credentials: PlaidCredentials | MoneyMovementCredentials;
    let details: Record<string, unknown>;

    if (provider === "plaid") {
      const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
      const secret = typeof body.secret === "string" ? body.secret.trim() : "";
      if (clientId.length < 4 || clientId.length > 256 || secret.length < 8 || secret.length > 4096) {
        return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Enter the Plaid Client ID and the matching Sandbox or Production Secret." }, { status: 400, headers: noStore });
      }
      credentials = { clientId, secret };
      details = await testPlaidCredentials(environment, credentials);
    } else {
      const key = typeof body.key === "string" ? body.key.trim() : "";
      const secret = typeof body.secret === "string" ? body.secret.trim() : "";
      if (key.length < 4 || key.length > 512 || secret.length < 8 || secret.length > 4096) {
        return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Enter the NMI Money Movement API key and matching API secret for the selected environment." }, { status: 400, headers: noStore });
      }
      credentials = { key, secret };
      details = await testMoneyMovementCredentials(environment, credentials);
    }

    const label = provider === "plaid"
      ? (environment === "demo" ? "Plaid Sandbox" : "Plaid Production")
      : (environment === "demo" ? "NMI Money Movement Sandbox" : "NMI Money Movement Production");
    const encrypted = encryptProviderKey(JSON.stringify(credentials));
    const id = randomUUID();
    const saved = await getDbPool().query<{
      id: string; service_id: string; display_name: string; environment: BankingEnvironment;
      status: string; last_tested_at: string | null; updated_at: string;
    }>(
      "INSERT INTO public.balmz_service_credentials (id, service_id, display_name, environment, encrypted_credentials, status, last_tested_at, created_by_user_id) VALUES ($1, $2, $3, $4, $5, 'connected', now(), $6) ON CONFLICT (service_id, environment, display_name) DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials, status = 'connected', last_tested_at = now(), last_error_code = NULL, updated_at = now() RETURNING id, service_id, display_name, environment, status, last_tested_at, updated_at",
      [id, provider, label, environment, encrypted, auth.session.user.id],
    );
    await getDbPool().query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'banking_provider_credentials_saved', $3::jsonb)",
      [randomUUID(), auth.session.user.id, JSON.stringify({ provider, environment, source: "Banking Secret Vault" })],
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      details,
      credential: publicRecord(saved.rows[0]),
      message: "Credentials passed the provider connection test and were encrypted. The secret will not be displayed again.",
    }, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return schemaRequired();
    const code = error instanceof Error ? error.message : "BANKING_CREDENTIAL_SAVE_FAILED";
    const message = code.includes("CREDENTIAL_REJECTED")
      ? "The provider rejected these credentials. Confirm the key, secret and environment."
      : code.startsWith("PLAID_")
        ? "Plaid could not verify these credentials. Confirm that the Sandbox or Production Secret matches the Client ID."
        : "The provider connection test failed. Check the credentials and try again.";
    return NextResponse.json({ error: code, message }, { status: 502, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  let body: { id?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) {
    return NextResponse.json({ error: "INVALID_CREDENTIAL" }, { status: 400, headers: noStore });
  }
  try {
    const result = await getDbPool().query<{ service_id: string; environment: string }>(
      "DELETE FROM public.balmz_service_credentials WHERE id = $1 AND service_id IN ('plaid', 'money-movement') RETURNING service_id, environment",
      [body.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "CREDENTIAL_NOT_FOUND" }, { status: 404, headers: noStore });
    await getDbPool().query(
      "INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata) VALUES ($1, $2, 'banking_provider_credentials_removed', $3::jsonb)",
      [randomUUID(), auth.session?.user.id, JSON.stringify({ provider: result.rows[0].service_id, environment: result.rows[0].environment })],
    ).catch(() => undefined);
    return NextResponse.json({ success: true }, { headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return schemaRequired();
    return NextResponse.json({ error: "BANKING_CREDENTIAL_REMOVE_FAILED" }, { status: 503, headers: noStore });
  }
}
