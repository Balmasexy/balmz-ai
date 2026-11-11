import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDbPool } from "@/lib/db";
import {
  decryptServiceCredentials,
  serviceCredentialsFromEnvironment,
  type ServiceEnvironment,
} from "@/lib/service-connectors";

export type PaymentEnvironment = "demo" | "live";

type CheckoutAttempt = {
  id: string;
  user_id: string;
  user_email: string;
  plan_id: string;
  reference: string;
  provider_reference: string | null;
  expected_amount_minor: string;
  currency: string;
  billing_interval: "month" | "year" | "one_time";
  entitlements_snapshot: Record<string, unknown>;
  environment: PaymentEnvironment;
  status: string;
  expires_at: Date;
};

type PaystackVerifyPayload = {
  status?: boolean;
  message?: string;
  data?: {
    id?: number;
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    customer?: { email?: string; customer_code?: string };
    subscription?: { subscription_code?: string };
  };
};

function paymentSecretFromEnvironment(environment: PaymentEnvironment): string | null {
  const mode = process.env.PAYSTACK_MODE?.trim().toLowerCase();
  const prefix = environment === "demo" ? "sk_test_" : "sk_live_";
  if (mode !== (environment === "demo" ? "test" : "live")) {
    return null;
  }
  const candidates = environment === "demo"
    ? [process.env.PAYSTACK_TEST_SECRET_KEY, process.env.PAYSTACK_SECRET_KEY]
    : [process.env.PAYSTACK_LIVE_SECRET_KEY, process.env.PAYSTACK_SECRET_KEY];
  const value = candidates.find((item) => item?.trim().startsWith(prefix))?.trim();
  return value ?? null;
}

export async function getPaystackSecretKey(environment: PaymentEnvironment): Promise<string> {
  const pool = getDbPool();
  try {
    const result = await pool.query<{ encrypted_credentials: string }>(
      `SELECT encrypted_credentials
         FROM public.balmz_service_credentials
        WHERE service_id = 'paystack'
          AND environment = $1
          AND status = 'connected'
        ORDER BY last_tested_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [environment],
    );
    if (result.rows[0]) {
      const value = decryptServiceCredentials(result.rows[0].encrypted_credentials).secretKey?.trim();
      if (value && value.startsWith(environment === "demo" ? "sk_test_" : "sk_live_")) return value;
      throw new Error("PAYSTACK_STORED_KEY_MODE_MISMATCH");
    }
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "42P01")) throw error;
  }

  const value = paymentSecretFromEnvironment(environment);
  if (!value) throw new Error("PAYSTACK_KEY_NOT_CONFIGURED");
  return value;
}

export async function isPaymentEnvironmentEnabled(environment: PaymentEnvironment): Promise<boolean> {
  try {
    const result = await getDbPool().query<{ enabled: boolean }>(
      "SELECT enabled FROM public.balmz_payment_environment WHERE environment = $1 LIMIT 1",
      [environment],
    );
    return result.rows[0]?.enabled === true;
  } catch {
    return false;
  }
}

export function verifyPaystackWebhookSignature(rawBody: string, headers: Headers, secretKey: string, webhookSecret?: string): boolean {
  const currentSignature = headers.get("paystack-signature") ?? "";
  const legacySignature = headers.get("x-paystack-signature") ?? "";

  if (currentSignature && webhookSecret) {
    const parts = currentSignature.split(",");
    const timestamp = parts.map((part) => part.trim()).find((part) => part.startsWith("t="))?.slice(2);
    const signatures = parts
      .map((part) => part.trim())
      .filter((part) => part.startsWith("v1="))
      .map((part) => part.slice(3).split(":").at(-1) ?? "")
      .filter((part) => /^[0-9a-f]{128}$/i.test(part));

    const numericTimestamp = Number(timestamp);
    if (
      !Number.isSafeInteger(numericTimestamp) ||
      Math.abs(Date.now() / 1000 - numericTimestamp) > 300 ||
      !signatures.length
    ) return false;

    const expected = createHmac("sha512", webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest();
    return signatures.some((signature) => {
      const actual = Buffer.from(signature, "hex");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  }

  if (legacySignature && /^[0-9a-f]{128}$/i.test(legacySignature)) {
    const expected = createHmac("sha512", secretKey).update(rawBody).digest();
    const actual = Buffer.from(legacySignature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  return false;
}

async function verifyPaystackTransaction(reference: string, environment: PaymentEnvironment) {
  const secret = await getPaystackSecretKey(environment);
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new Error("PAYSTACK_VERIFY_REQUEST_FAILED");
  const result = await response.json() as PaystackVerifyPayload;
  if (result.status !== true || !result.data) throw new Error("PAYSTACK_VERIFY_RESPONSE_INVALID");
  return result.data;
}

export async function initializePaystackCheckout(input: {
  userId: string;
  userEmail: string;
  planId: string;
  environment: PaymentEnvironment;
  appBaseUrl: string;
}) {
  const pool = getDbPool();
  const client = await pool.connect();
  const reference = `BALMZ-${randomUUID().replaceAll("-", "").toUpperCase()}`;
  let attempt: CheckoutAttempt | null = null;

  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM public."user" WHERE id = $1 FOR UPDATE`,
      [input.userId],
    );
    if (!user.rows[0] || user.rows[0].email.toLowerCase() !== input.userEmail.toLowerCase()) {
      throw new Error("PAYMENT_USER_UNAVAILABLE");
    }

    const mode = await client.query<{ enabled: boolean }>(
      "SELECT enabled FROM public.balmz_payment_environment WHERE environment = $1 FOR SHARE",
      [input.environment],
    );
    if (mode.rows[0]?.enabled !== true) throw new Error("PAYMENT_ENVIRONMENT_DISABLED");

    const active = await client.query(
      `SELECT s.id
         FROM public.balmz_subscriptions s
         JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = $1 AND p.code <> 'free'
          AND s.status IN ('active', 'trialing', 'past_due')
          AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
        LIMIT 1 FOR UPDATE OF s`,
      [input.userId],
    );
    if (active.rowCount) throw new Error("ACTIVE_SUBSCRIPTION_EXISTS");

    const plan = await client.query<{
      id: string;
      code: string;
      display_name: string;
      price_minor: string | null;
      currency: string | null;
      billing_interval: "month" | "year" | "one_time" | null;
      entitlements: Record<string, unknown>;
    }>(
      `SELECT id, code, display_name, price_minor, currency, billing_interval, entitlements
         FROM public.balmz_subscription_plans
        WHERE id = $1 AND is_public = true AND is_enabled = true
        LIMIT 1 FOR SHARE`,
      [input.planId],
    );
    const selected = plan.rows[0];
    if (!selected || !selected.price_minor || !selected.currency ||
        !["month", "year", "one_time"].includes(selected.billing_interval ?? "")) {
      throw new Error("PLAN_NOT_AVAILABLE_FOR_PURCHASE");
    }
    const amount = Number(selected.price_minor);
    const currency = selected.currency.trim().toUpperCase();
    if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
      throw new Error("PLAN_PRICE_CONFIGURATION_INVALID");
    }

    const attemptId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const saved = await client.query<CheckoutAttempt>(
      `INSERT INTO public.balmz_checkout_attempts
         (id, user_id, plan_id, environment, reference, expected_amount_minor, currency,
          billing_interval, entitlements_snapshot, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'pending', $10)
       RETURNING id, user_id, plan_id, reference, provider_reference,
                 expected_amount_minor, currency, billing_interval,
                 entitlements_snapshot, environment, status, expires_at`,
      [attemptId, input.userId, input.planId, input.environment, reference, amount, currency,
        selected.billing_interval, JSON.stringify(selected.entitlements ?? {}), expiresAt],
    );
    attempt = saved.rows[0];

    await client.query(
      `INSERT INTO public.balmz_payment_records
         (id, user_id, provider, provider_reference, amount_minor, currency, status)
       VALUES ($1, $2, 'paystack', $3, $4, $5, 'pending')`,
      [randomUUID(), input.userId, reference, amount, currency],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new Error("CHECKOUT_ALREADY_PENDING");
    }
    throw error;
  } finally {
    client.release();
  }

  if (!attempt) throw new Error("CHECKOUT_ATTEMPT_NOT_CREATED");

  try {
    const secret = await getPaystackSecretKey(input.environment);
    const callbackUrl = new URL("/api/payments/callback", input.appBaseUrl).toString();
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: input.userEmail,
        amount: attempt.expected_amount_minor,
        currency: attempt.currency,
        reference,
        callback_url: callbackUrl,
        metadata: {
          balmz_checkout_id: attempt.id,
          balmz_plan_id: attempt.plan_id,
          balmz_user_id: input.userId,
          balmz_environment: input.environment,
        },
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("PAYSTACK_INITIALIZE_REQUEST_FAILED");
    const payload = await response.json() as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };
    const authorizationUrl = payload.data?.authorization_url;
    const providerReference = payload.data?.reference;
    if (payload.status !== true || !authorizationUrl || !providerReference) {
      throw new Error("PAYSTACK_INITIALIZE_RESPONSE_INVALID");
    }
    const parsedAuthorization = new URL(authorizationUrl);
    if (parsedAuthorization.protocol !== "https:" || parsedAuthorization.hostname !== "checkout.paystack.com") {
      throw new Error("PAYSTACK_CHECKOUT_URL_INVALID");
    }
    await pool.query(
      `UPDATE public.balmz_checkout_attempts
          SET provider_reference = $2, updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [attempt.id, providerReference],
    );
    if (providerReference !== reference) {
      await pool.query(
        "UPDATE public.balmz_payment_records SET provider_reference = $2, updated_at = now() WHERE provider_reference = $1",
        [reference, providerReference],
      );
    }
    return {
      checkoutUrl: authorizationUrl,
      reference: providerReference,
      environment: input.environment,
      planName: "selected plan",
      expiresAt: attempt.expires_at,
    };
  } catch (error) {
    await pool.query(
      `UPDATE public.balmz_checkout_attempts SET status = 'failed', updated_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [attempt.id],
    );
    await pool.query(
      `UPDATE public.balmz_payment_records SET status = 'failed', updated_at = now()
        WHERE provider_reference = $1 AND status = 'pending'`,
      [reference],
    );
    throw error;
  }
}

export async function verifyAndActivatePaystackCheckout(reference: string, expectedEnvironment?: PaymentEnvironment) {
  if (!/^[A-Za-z0-9.=-]{8,120}$/.test(reference)) throw new Error("PAYMENT_REFERENCE_INVALID");
  const pool = getDbPool();
  const query = await pool.query<CheckoutAttempt>(
    `SELECT c.id, c.user_id, u.email AS user_email, c.plan_id, c.reference, c.provider_reference,
            c.expected_amount_minor, c.currency, c.billing_interval, c.entitlements_snapshot,
            c.environment, c.status, c.expires_at
       FROM public.balmz_checkout_attempts c
       JOIN public."user" u ON u.id = c.user_id
      WHERE c.reference = $1 OR c.provider_reference = $1
      ORDER BY c.created_at DESC LIMIT 1`,
    [reference],
  );
  const attempt = query.rows[0];
  if (!attempt) throw new Error("CHECKOUT_NOT_FOUND");
  if (expectedEnvironment && attempt.environment !== expectedEnvironment) throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
  if (attempt.status === "success") return { success: true, duplicate: true, planId: attempt.plan_id };
  if (attempt.status !== "pending") throw new Error("CHECKOUT_NOT_PENDING");
  if (new Date(attempt.expires_at).getTime() < Date.now()) {
    await pool.query(
      "UPDATE public.balmz_checkout_attempts SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'pending'",
      [attempt.id],
    );
    throw new Error("CHECKOUT_EXPIRED");
  }

  const providerReference = attempt.provider_reference ?? attempt.reference;
  const verified = await verifyPaystackTransaction(providerReference, attempt.environment);
  if (verified.reference !== providerReference) throw new Error("PAYSTACK_REFERENCE_MISMATCH");
  if (verified.status !== "success") {
    if (verified.status === "failed" || verified.status === "abandoned") {
      await pool.query(
        "UPDATE public.balmz_checkout_attempts SET status = $2, updated_at = now() WHERE id = $1 AND status = 'pending'",
        [attempt.id, verified.status],
      );
      await pool.query(
        "UPDATE public.balmz_payment_records SET status = $2, updated_at = now() WHERE provider_reference = $1 AND status = 'pending'",
        [providerReference, verified.status],
      );
    }
    return { success: false, status: verified.status ?? "pending" };
  }
  if (Number(verified.amount) !== Number(attempt.expected_amount_minor)) throw new Error("PAYMENT_AMOUNT_MISMATCH");
  if ((verified.currency ?? "").toUpperCase() !== attempt.currency.toUpperCase()) throw new Error("PAYMENT_CURRENCY_MISMATCH");
  if ((verified.customer?.email ?? "").toLowerCase() !== attempt.user_email.toLowerCase()) throw new Error("PAYMENT_CUSTOMER_MISMATCH");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockedUser = await client.query<{ id: string }>(
      'SELECT id FROM public."user" WHERE id = $1 FOR UPDATE',
      [attempt.user_id],
    );
    if (!lockedUser.rowCount) throw new Error("PAYMENT_USER_UNAVAILABLE");
    const lockedAttempt = await client.query<{ status: string }>(
      "SELECT status FROM public.balmz_checkout_attempts WHERE id = $1 FOR UPDATE",
      [attempt.id],
    );
    if (lockedAttempt.rows[0]?.status === "success") {
      await client.query("COMMIT");
      return { success: true, duplicate: true, planId: attempt.plan_id };
    }
    if (lockedAttempt.rows[0]?.status !== "pending") throw new Error("CHECKOUT_NOT_PENDING");

    const current = await client.query<{ id: string; code: string }>(
      `SELECT s.id, p.code
         FROM public.balmz_subscriptions s
         JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = $1 AND s.status IN ('active', 'trialing', 'past_due')
          AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
        LIMIT 1 FOR UPDATE OF s`,
      [attempt.user_id],
    );
    if (current.rows.some((row) => row.code !== "free")) throw new Error("SUBSCRIPTION_ALREADY_ACTIVE");
    // A Free subscription is the default baseline, not a barrier to a paid plan.
    await client.query(
      `UPDATE public.balmz_subscriptions
          SET status = 'paused', updated_at = now()
        WHERE user_id = $1 AND status = 'active'
          AND plan_id = (SELECT id FROM public.balmz_subscription_plans WHERE code = 'free')`,
      [attempt.user_id],
    );
    await client.query(
      `UPDATE public.balmz_complimentary_access_grants
          SET revoked_at = now(), updated_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [attempt.user_id],
    );

    const periodStart = new Date();
    let periodEnd: Date | null = null;
    if (attempt.billing_interval === "month") {
      periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    } else if (attempt.billing_interval === "year") {
      periodEnd = new Date(periodStart);
      periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    }

    const subscriptionId = randomUUID();
    await client.query(
      `INSERT INTO public.balmz_subscriptions
         (id, user_id, plan_id, status, billing_provider, provider_customer_reference,
          provider_subscription_reference, current_period_starts_at, current_period_ends_at)
       VALUES ($1, $2, $3, 'active', 'paystack', $4, $5, $6, $7)`,
      [subscriptionId, attempt.user_id, attempt.plan_id,
        verified.customer?.customer_code ?? null,
        verified.subscription?.subscription_code ?? null,
        periodStart, periodEnd],
    );

    await client.query(
      `UPDATE public.balmz_payment_records
          SET status = 'success', verified_at = now(), subscription_id = $2, updated_at = now()
        WHERE provider_reference = $1 AND user_id = $3 AND amount_minor = $4
          AND upper(currency) = upper($5)`,
      [providerReference, subscriptionId, attempt.user_id, attempt.expected_amount_minor, attempt.currency],
    );
    const paymentCheck = await client.query(
      "SELECT id FROM public.balmz_payment_records WHERE provider_reference = $1 AND status = 'success' AND subscription_id = $2",
      [providerReference, subscriptionId],
    );
    if (!paymentCheck.rowCount) throw new Error("PAYMENT_RECORD_MISMATCH");

    await client.query(
      `UPDATE public.balmz_checkout_attempts
          SET status = 'success', verified_at = now(), updated_at = now()
        WHERE id = $1`,
      [attempt.id],
    );

    await client.query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'paystack_payment_verified', $3::jsonb)`,
      [randomUUID(), attempt.user_id, JSON.stringify({
        checkoutId: attempt.id,
        reference: providerReference,
        amountMinor: attempt.expected_amount_minor,
        currency: attempt.currency,
        environment: attempt.environment,
        subscriptionId,
      })],
    );

    await client.query("COMMIT");
    return { success: true, duplicate: false, planId: attempt.plan_id, subscriptionId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createWebhookDedupeId(environment: PaymentEnvironment, event: string, dataId: unknown, rawBody: string) {
  const eventKey = typeof dataId === "number" || typeof dataId === "string"
    ? String(dataId)
    : createHash("sha256").update(rawBody).digest("hex");
  return `paystack:${environment}:${event}:${eventKey}`;
}

export function webhookEnvironment(value: string): PaymentEnvironment | null {
  return value === "demo" || value === "live" ? value : null;
}
