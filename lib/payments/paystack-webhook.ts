import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createWebhookDedupeId,
  getPaystackSecretKey,
  verifyAndActivatePaystackCheckout,
  verifyPaystackWebhookSignature,
  type PaymentEnvironment,
} from "@/lib/payments/paystack-billing";
import { getDbPool } from "@/lib/db";

function webhookSecret(environment: PaymentEnvironment): string | undefined {
  return environment === "demo"
    ? process.env.PAYSTACK_TEST_WEBHOOK_SECRET?.trim() || process.env.PAYSTACK_WEBHOOK_SECRET?.trim()
    : process.env.PAYSTACK_LIVE_WEBHOOK_SECRET?.trim() || process.env.PAYSTACK_WEBHOOK_SECRET?.trim();
}

export async function handlePaystackWebhook(request: Request, environment: PaymentEnvironment) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 1_000_000) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let secret: string;
  try {
    secret = await getPaystackSecretKey(environment);
  } catch {
    return NextResponse.json({ error: "PAYSTACK_WEBHOOK_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
  }

  if (!verifyPaystackWebhookSignature(rawBody, request.headers, secret, webhookSecret(environment))) {
    return NextResponse.json({ error: "INVALID_PAYSTACK_SIGNATURE" }, { status: 401 });
  }

  let payload: {
    event?: unknown;
    data?: { id?: unknown; reference?: unknown };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "INVALID_WEBHOOK_JSON" }, { status: 400 });
  }

  const event = typeof payload.event === "string" ? payload.event : "unknown";
  const dataId = payload.data?.id;
  const reference = typeof payload.data?.reference === "string" ? payload.data.reference : "";
  const dedupeId = createWebhookDedupeId(environment, event, dataId, rawBody);
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const pool = getDbPool();

  try {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO public.balmz_billing_webhook_events
         (id, provider, provider_event_id, event_type, payload_sha256, processing_status)
       VALUES ($1, 'paystack', $2, $3, $4, 'received')
       ON CONFLICT (provider_event_id) DO NOTHING
       RETURNING id`,
      [dedupeId, dedupeId, event.slice(0, 120), digest],
    );

    if (!inserted.rowCount) {
      // Paystack retries a webhook after non-2xx responses. Reclaim failed work,
      // and recover a process that died while an event remained "received".
      const reclaimed = await pool.query<{ id: string }>(
        `UPDATE public.balmz_billing_webhook_events
            SET processing_status = 'received',
                received_at = now(),
                processed_at = NULL,
                error_code = NULL
          WHERE provider_event_id = $1
            AND (
              processing_status = 'failed'
              OR (processing_status = 'received' AND received_at < now() - interval '5 minutes')
            )
          RETURNING id`,
        [dedupeId],
      );
      if (!reclaimed.rowCount) {
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      }
    }

    if (event === "charge.success" || event === "charge.failed") {
      if (!reference) {
        await pool.query(
          "UPDATE public.balmz_billing_webhook_events SET processing_status = 'ignored', processed_at = now() WHERE provider_event_id = $1",
          [dedupeId],
        );
        return NextResponse.json({ received: true, ignored: true }, { status: 200 });
      }

      await verifyAndActivatePaystackCheckout(reference, environment);
      await pool.query(
        "UPDATE public.balmz_billing_webhook_events SET processing_status = 'processed', processed_at = now() WHERE provider_event_id = $1",
        [dedupeId],
      );
      return NextResponse.json({ received: true, processed: true }, { status: 200 });
    }

    await pool.query(
      "UPDATE public.balmz_billing_webhook_events SET processing_status = 'ignored', processed_at = now() WHERE provider_event_id = $1",
      [dedupeId],
    );
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  } catch (error) {
    const safeCode = error instanceof Error ? error.message : "WEBHOOK_PROCESSING_FAILED";
    await pool.query(
      "UPDATE public.balmz_billing_webhook_events SET processing_status = 'failed', error_code = $2 WHERE provider_event_id = $1",
      [dedupeId, safeCode.slice(0, 80)],
    ).catch(() => undefined);
    return NextResponse.json({
      error: "WEBHOOK_PROCESSING_FAILED",
      message: "The signed Paystack event could not be reconciled. Paystack can retry delivery.",
    }, { status: 500 });
  }
}
