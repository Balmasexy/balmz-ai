import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isPaymentEnvironmentEnabled } from "@/lib/payments/paystack-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const [plans, demoEnabled, liveEnabled, current] = await Promise.all([
      getDbPool().query<{
        id: string; code: string; display_name: string; description: string | null;
        currency: string | null; price_minor: string | null; billing_interval: string | null;
        entitlements: Record<string, unknown>;
      }>(
        `SELECT id, code, display_name, description, currency, price_minor, billing_interval, entitlements
           FROM public.balmz_subscription_plans
          WHERE is_public = true AND is_enabled = true
          ORDER BY price_minor ASC NULLS LAST, display_name ASC`,
      ),
      isPaymentEnvironmentEnabled("demo"),
      isPaymentEnvironmentEnabled("live"),
      getDbPool().query<{ plan_name: string; status: string; current_period_ends_at: string | null }>(
        `SELECT p.display_name AS plan_name, s.status, s.current_period_ends_at
           FROM public.balmz_subscriptions s
           JOIN public.balmz_subscription_plans p ON p.id = s.plan_id
          WHERE s.user_id = $1
            AND s.status IN ('active', 'trialing', 'past_due')
            AND (s.current_period_ends_at IS NULL OR s.current_period_ends_at > now())
          ORDER BY s.created_at DESC LIMIT 1`,
        [session.user.id],
      ),
    ]);
    return NextResponse.json({
      plans: plans.rows.map((plan) => ({
        ...plan,
        priceMinor: plan.price_minor,
        priceMinorNumber: plan.price_minor === null ? null : Number(plan.price_minor),
        currency: plan.currency?.trim().toUpperCase() ?? null,
      })),
      paymentModes: { demo: demoEnabled, live: liveEnabled },
      activeSubscription: current.rows[0] ?? null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "BILLING_DATA_UNAVAILABLE",
      message: "The billing catalogue is not available yet. Ask the administrator to finish the billing database setup.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
