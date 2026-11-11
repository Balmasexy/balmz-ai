"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Plan = {
  id: string;
  code: string;
  display_name: string;
  description: string | null;
  currency: string | null;
  price_minor: string | null;
  billing_interval: "month" | "year" | "one_time" | null;
  priceMinorNumber: number | null;
};
type BillingPayload = {
  plans: Plan[];
  paymentModes: { demo: boolean; live: boolean };
  activeSubscription: { plan_name: string; plan_code: string; status: string; current_period_ends_at: string | null } | null;
  trialAvailable: boolean;
};

function money(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return currency + " " + (minor / 100).toFixed(2);
  }
}
function date(value: string | null) {
  if (!value) return "No expiry";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("en-NG", { dateStyle: "long" });
}

export function BillingWorkspace() {
  const [payload, setPayload] = useState<BillingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironment] = useState<"demo" | "live">("demo");
  const [busyPlan, setBusyPlan] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/plans", { cache: "no-store" });
      const result = await response.json() as BillingPayload & { message?: string };
      if (!response.ok) throw new Error(result.message || "Billing catalogue is not available.");
      setPayload(result);
      setEnvironment(result.paymentModes.live ? "live" : "demo");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Billing data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    if (!status) return;
    const messages: Record<string, string> = {
      success: "Payment verified successfully. Your subscription is active.",
      pending: "Paystack has not confirmed the payment yet. Refresh this page in a moment.",
      expired: "This checkout expired. Start a new checkout to try again.",
      "verification-failed": "Payment verification did not finish. Contact support before paying again.",
      "checkout-not-found": "This checkout does not belong to the signed-in account.",
      "sign-in-required": "Sign in again to verify your payment.",
      "invalid-reference": "The payment callback reference was invalid.",
    };
    setNotice(messages[status] || "Returned from Paystack. Refresh to check your subscription.");
    window.history.replaceState({}, "", "/dashboard/billing");
    if (status === "success") void refresh();
  }, [refresh]);

  async function startTrial() {
    if (!payload?.trialAvailable || busyPlan) return;
    setBusyPlan("pro-trial");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/subscription/trial", { method: "POST", credentials: "same-origin" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "The Pro trial could not be started.");
      setNotice("Your seven-day Pro trial is active. Your account will return to Free when the trial expires.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Pro trial could not be started.");
    } finally {
      setBusyPlan("");
    }
  }

  async function checkout(plan: Plan) {
    if (busyPlan || !payload || !payload.paymentModes[environment]) return;
    setBusyPlan(plan.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, environment }),
      });
      const result = await response.json() as { checkoutUrl?: string; message?: string };
      if (!response.ok || !result.checkoutUrl) throw new Error(result.message || "Checkout could not be started.");
      window.location.assign(result.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paystack checkout could not be opened.");
      setBusyPlan("");
    }
  }

  const available = payload ? payload.paymentModes[environment] : false;
  const modeCount = payload ? Number(payload.paymentModes.demo) + Number(payload.paymentModes.live) : 0;
  const paidPlanActive = ["pro_monthly", "pro_yearly", "pro_trial"].includes(payload?.activeSubscription?.plan_code ?? "");

  return (
    <main className="min-h-[100dvh] bg-[#080c14] text-slate-100">
      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <div><p className="text-sm font-semibold text-white">Plans & billing</p><p className="mt-0.5 text-[10px] text-slate-500">Secure Paystack checkout · BALMZ AI subscriptions</p></div>
        <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-[var(--balmz-orange)]/40 hover:text-white"><span aria-hidden="true">←</span> Back</Link>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-9">
        <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-6 sm:p-8">
          <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">BALMZ AI billing</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Choose the plan that fits your work.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Plans and prices are loaded from the live BALMZ AI billing database. Checkout is initialized on the server and subscriptions are only activated after Paystack confirms the exact payment.</p>
        </section>

        {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
        {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}

        {payload?.activeSubscription ? <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.045] p-5"><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Current subscription</p><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><p className="text-lg font-semibold text-white">{payload.activeSubscription.plan_name}</p><p className="mt-1 text-xs text-slate-400">Status: {payload.activeSubscription.status} · Paid through: {date(payload.activeSubscription.current_period_ends_at)}</p></div><span className="rounded-full border border-emerald-400/20 px-3 py-1 text-[10px] font-semibold text-emerald-300">Active</span></div></section> : null}

        {payload?.trialAvailable ? <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.055] p-5"><div><p className="text-sm font-semibold text-white">Try BALMZ AI Pro free for 7 days</p><p className="mt-1 text-xs leading-5 text-slate-400">500 AI messages per UTC calendar month during the trial. No payment card or Paystack checkout is required. After seven days your account returns to Free.</p></div><button type="button" onClick={() => void startTrial()} disabled={Boolean(busyPlan)} className="min-h-11 rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-bold text-[#17100a] disabled:opacity-40">{busyPlan === "pro-trial" ? "Starting trial…" : "Start 7-day Pro trial"}</button></section> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-4">
          <div><p className="text-xs font-semibold text-white">Checkout environment</p><p className="mt-1 text-[10px] text-slate-500">Demo payments do not charge real money. Live payments use the activated merchant account.</p></div>
          {modeCount > 1 ? <div className="flex rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" onClick={() => setEnvironment("demo")} className={"rounded-lg px-4 py-2 text-[10px] font-semibold " + (environment === "demo" ? "bg-amber-300 text-[#17100a]" : "text-slate-400")}>Demo</button><button type="button" onClick={() => setEnvironment("live")} className={"rounded-lg px-4 py-2 text-[10px] font-semibold " + (environment === "live" ? "bg-emerald-300 text-[#07130b]" : "text-slate-400")}>Live</button></div> : <span className={"rounded-full border px-3 py-1 text-[10px] " + (environment === "live" ? "border-emerald-400/20 text-emerald-300" : "border-amber-400/20 text-amber-200")}>{environment.toUpperCase()}</span>}
        </div>

        {loading ? <div className="rounded-2xl border border-white/[0.08] p-10 text-center text-xs text-slate-500">Loading published plans…</div> : null}
        {!loading && !payload?.plans.length ? <div className="rounded-2xl border border-white/[0.08] p-10 text-center"><p className="text-sm font-semibold text-white">No published plans yet</p><p className="mt-2 text-xs text-slate-500">The administrator must publish a plan with a price, currency and billing interval before checkout can begin.</p></div> : null}
        {!loading && payload?.plans.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{payload.plans.map((plan) => {
          const validPrice = plan.priceMinorNumber !== null && plan.priceMinorNumber >= 0 && Boolean(plan.currency);
          const payablePlan = validPrice && plan.priceMinorNumber > 0;
          const canCheckout = available && payablePlan && !paidPlanActive;
          return <article key={plan.id} className="flex flex-col rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-5 transition hover:border-[var(--balmz-orange)]/25">
            <div className="flex-1"><p className="text-xs font-semibold text-slate-200">{plan.display_name}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{plan.billing_interval ?? "Billing interval not configured"}</p><p className="mt-5 text-3xl font-semibold tracking-tight text-white">{validPrice ? money(plan.priceMinorNumber!, plan.currency!) : "Not configured"}</p>{plan.description ? <p className="mt-3 text-xs leading-6 text-slate-400">{plan.description}</p> : null}</div>
            <button type="button" onClick={() => void checkout(plan)} disabled={!canCheckout || Boolean(busyPlan)} className="mt-6 min-h-11 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{busyPlan === plan.id ? "Opening secure checkout…" : !validPrice ? "Price not configured" : !payablePlan ? "Free plan included" : !available ? "Checkout unavailable" : paidPlanActive ? "Pro plan already active" : "Continue to Paystack"}</button>
          </article>;
        })}</div> : null}

        {!available && !loading ? <p className="text-center text-[10px] leading-5 text-slate-600">This payment environment is currently disabled. The Super Admin must verify the matching Paystack credentials and explicitly enable it.</p> : null}
        <p className="text-center text-[10px] leading-5 text-slate-600">A successful browser return alone does not activate a subscription. BALMZ AI verifies each transaction with Paystack. Monthly/yearly plans are granted for the paid term; automatic recurring billing is not enabled by this initial checkout implementation.</p>
      </div>
    </main>
  );
}
