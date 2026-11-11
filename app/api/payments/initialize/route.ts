import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { initializePaystackCheckout, type PaymentEnvironment } from "@/lib/payments/paystack-billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let body: { planId?: unknown; environment?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  if (typeof body.planId !== "string" || body.planId.length < 1 || body.planId.length > 128) {
    return NextResponse.json({ error: "PLAN_REQUIRED", message: "Select a valid published plan." }, { status: 400 });
  }
  const environment: PaymentEnvironment = body.environment === "live" ? "live" : "demo";
  const appBaseUrl = process.env.APP_BASE_URL || process.env.BETTER_AUTH_URL;
  if (!appBaseUrl || !appBaseUrl.startsWith("https://")) {
    return NextResponse.json({
      error: "APP_BASE_URL_NOT_CONFIGURED",
      message: "The secure checkout callback URL is not configured on the server.",
    }, { status: 503 });
  }

  try {
    const checkout = await initializePaystackCheckout({
      userId: session.user.id,
      userEmail: session.user.email,
      planId: body.planId,
      environment,
      appBaseUrl,
    });
    return NextResponse.json({
      success: true,
      checkoutUrl: checkout.checkoutUrl,
      reference: checkout.reference,
      environment: checkout.environment,
      expiresAt: checkout.expiresAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_INITIALIZATION_FAILED";
    const status = code === "PAYMENT_ENVIRONMENT_DISABLED" ? 409
      : code === "ACTIVE_SUBSCRIPTION_EXISTS" ? 409
      : code === "CHECKOUT_ALREADY_PENDING" ? 409
      : code === "PAYSTACK_KEY_NOT_CONFIGURED" ? 503
      : code === "PLAN_NOT_AVAILABLE_FOR_PURCHASE" ? 404
      : code === "PLAN_PRICE_CONFIGURATION_INVALID" ? 409
      : 502;
    const message = code === "PAYMENT_ENVIRONMENT_DISABLED"
      ? "This payment environment has not been enabled by the BALMZ AI administrator."
      : code === "ACTIVE_SUBSCRIPTION_EXISTS"
        ? "You already have an active subscription. Contact support for plan changes or renewal."
        : code === "CHECKOUT_ALREADY_PENDING"
          ? "You already have a pending checkout. Complete it or wait for it to expire before starting another."
          : code === "PAYSTACK_KEY_NOT_CONFIGURED"
            ? "The selected Paystack environment is not connected."
            : code === "PLAN_NOT_AVAILABLE_FOR_PURCHASE"
              ? "This plan is not currently available for purchase."
              : "Paystack could not initialize checkout. The payment record was not activated.";
    return NextResponse.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
