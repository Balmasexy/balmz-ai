import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import {
  decryptServiceCredentials,
  testServiceConnection,
} from "@/lib/service-connectors";
import type { PaymentEnvironment } from "@/lib/payments/paystack-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), session: null };
  if (!(await isAdminUser(session.user.id))) return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), session: null };
  return { response: null, session };
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  try {
    const [modes, credentials] = await Promise.all([
      getDbPool().query<{ environment: PaymentEnvironment; enabled: boolean; verified_at: string | null; enabled_at: string | null }>(
        "SELECT environment, enabled, verified_at, enabled_at FROM public.balmz_payment_environment ORDER BY environment",
      ),
      getDbPool().query<{ environment: PaymentEnvironment; status: string; last_tested_at: string | null }>(
        `SELECT DISTINCT ON (environment) environment, status, last_tested_at
           FROM public.balmz_service_credentials
          WHERE service_id = 'paystack'
          ORDER BY environment, last_tested_at DESC NULLS LAST, created_at DESC`,
      ),
    ]);
    return NextResponse.json({
      modes: modes.rows.map((mode) => ({
        ...mode,
        credential: credentials.rows.find((item) => item.environment === mode.environment) ?? null,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "PAYMENT_SCHEMA_REQUIRED", message: "Apply the BALMZ billing database migrations before enabling payment mode." }, { status: 503 });
    }
    return NextResponse.json({ error: "PAYMENT_MODE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.response || !auth.session) return auth.response;
  let body: { environment?: unknown; enabled?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  if (body.environment !== "demo" && body.environment !== "live") {
    return NextResponse.json({ error: "INVALID_PAYMENT_ENVIRONMENT" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "INVALID_ENABLED_VALUE" }, { status: 400 });
  const environment = body.environment as PaymentEnvironment;

  try {
    if (body.enabled) {
      const result = await getDbPool().query<{
        encrypted_credentials: string;
        last_tested_at: string | null;
      }>(
        `SELECT encrypted_credentials, last_tested_at
           FROM public.balmz_service_credentials
          WHERE service_id = 'paystack'
            AND environment = $1
            AND status = 'connected'
          ORDER BY last_tested_at DESC NULLS LAST
          LIMIT 1`,
        [environment],
      );
      const credential = result.rows[0];
      if (!credential) {
        return NextResponse.json({
          error: "PAYSTACK_CREDENTIAL_NOT_VERIFIED",
          message: "Save and successfully test a Paystack credential for this environment before enabling payments.",
        }, { status: 409 });
      }
      if (!credential.last_tested_at || Date.now() - new Date(credential.last_tested_at).getTime() > 24 * 60 * 60 * 1000) {
        return NextResponse.json({
          error: "PAYSTACK_CREDENTIAL_TEST_STALE",
          message: "Test the saved Paystack credential again before enabling this payment environment.",
        }, { status: 409 });
      }
      const credentials = decryptServiceCredentials(credential.encrypted_credentials);
      await testServiceConnection("paystack", credentials, environment);
      if (environment === "live") {
        const webhookSecret =
          process.env.PAYSTACK_LIVE_WEBHOOK_SECRET?.trim() ||
          process.env.PAYSTACK_WEBHOOK_SECRET?.trim();
        if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
          return NextResponse.json({
            error: "LIVE_WEBHOOK_SECRET_REQUIRED",
            message: "Add PAYSTACK_LIVE_WEBHOOK_SECRET (or PAYSTACK_WEBHOOK_SECRET) in Render before enabling Live. Use the webhook signing secret from Paystack, not the API key.",
          }, { status: 409 });
        }
        const baseUrl = process.env.APP_BASE_URL || process.env.BETTER_AUTH_URL;
        if (!baseUrl || !baseUrl.startsWith("https://")) {
          return NextResponse.json({
            error: "HTTPS_APP_BASE_URL_REQUIRED",
            message: "Set APP_BASE_URL to the canonical HTTPS BALMZ AI production URL in Render before enabling Live.",
          }, { status: 409 });
        }
      }
    }

    const updated = await getDbPool().query(
      `UPDATE public.balmz_payment_environment
          SET enabled = $2,
              verified_at = CASE WHEN $2 THEN now() ELSE verified_at END,
              enabled_at = CASE WHEN $2 THEN now() ELSE NULL END,
              enabled_by_user_id = CASE WHEN $2 THEN $3 ELSE enabled_by_user_id END,
              updated_at = now()
        WHERE environment = $1
        RETURNING environment, enabled, verified_at, enabled_at`,
      [environment, body.enabled, auth.session.user.id],
    );
    if (!updated.rowCount) return NextResponse.json({ error: "PAYMENT_ENVIRONMENT_NOT_FOUND" }, { status: 404 });

    await getDbPool().query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        randomUUID(),
        auth.session.user.id,
        body.enabled ? "payment_environment_enabled" : "payment_environment_disabled",
        JSON.stringify({ environment }),
      ],
    );

    return NextResponse.json({ success: true, mode: updated.rows[0] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "PAYMENT_SCHEMA_REQUIRED", message: "Apply the BALMZ billing database migrations before enabling payment mode." }, { status: 503 });
    }
    const code = error instanceof Error ? error.message : "PAYMENT_ENVIRONMENT_UPDATE_FAILED";
    return NextResponse.json({
      error: code,
      message: "BALMZ AI could not verify the Paystack environment. Check the key, mode, webhook secret and Render environment.",
    }, { status: 502 });
  }
}
