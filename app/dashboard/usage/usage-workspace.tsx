"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type UsageItem = { metric: string; used: number; limit: number | null; periodEnd: string | null };
type UsagePayload = { active: boolean; subscription: { plan_name: string; status: string } | null; usage: UsageItem[]; message?: string };

function labelMetric(metric: string) {
  return metric.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function UsageWorkspace() {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as UsagePayload & { error?: string };
        if (!response.ok) throw new Error(result.message || result.error || "Usage data could not be loaded.");
        if (!cancelled) setPayload(result);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Usage data could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => payload?.usage ?? [], [payload]);

  return (
    <main className="min-h-[100dvh] bg-[#080c14] pb-12 text-slate-100">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <Link href="/dashboard/settings" aria-label="Back to settings" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-xl text-slate-300 hover:bg-white/5">←</Link>
        <div className="text-center"><p className="text-sm font-semibold text-white">Usage and limits</p><p className="text-[10px] text-slate-500">Account consumption</p></div>
        <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white">Chat</Link>
      </header>
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-7 sm:px-8">
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--balmz-orange)]">Plan status</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">{loading ? "Loading plan status…" : payload?.subscription?.plan_name || "No active BALMZ AI plan"}</h1>
          <p className="mt-2 text-xs leading-6 text-slate-400">{payload?.active ? "Your active subscription and plan limits are checked before every AI request." : "An active BALMZ AI plan is required before sending AI requests."}</p>
          {!loading && !payload?.active ? <Link href="/dashboard/billing" className="mt-4 inline-flex rounded-xl bg-[var(--balmz-orange)] px-4 py-2.5 text-xs font-semibold text-[#17100a]">View available plans</Link> : null}
        </section>
        {loading ? <p className="rounded-xl border border-white/[0.08] p-5 text-xs text-slate-500">Loading your actual usage records…</p> : null}
        {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-xs text-rose-200">{error}</div> : null}
        {!loading && !error && payload?.active && rows.length ? <section className="space-y-3">{rows.map((item) => {
          const ratio = item.limit && item.limit > 0 ? Math.min(100, Math.max(0, item.used / item.limit * 100)) : 0;
          return <article key={item.metric} className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-white">{labelMetric(item.metric)}</h2><span className="text-xs tabular-nums text-slate-400">{item.used.toLocaleString("en-NG")} / {item.limit === null ? "No limit set" : item.limit.toLocaleString("en-NG")}</span></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[var(--balmz-orange)]" style={{ width: item.limit && item.limit > 0 ? `${ratio}%` : "0%" }} /></div>
            <p className="mt-2 text-[10px] text-slate-500">{item.limit === null ? "This metric has no numeric limit configured." : `${Math.round(ratio)}% of the current monthly allowance used`}</p>
          </article>;
        })}</section> : null}
        {!loading && !error && payload?.active && !rows.length ? <div className="rounded-2xl border border-white/[0.08] p-8 text-center"><p className="text-sm font-medium text-white">No usage metrics are configured yet</p><p className="mt-2 text-xs text-slate-500">This plan has no numeric usage limits or current-period usage counters to display.</p></div> : null}
        <p className="text-center text-[10px] leading-5 text-slate-600">Usage values come from the BALMZ AI Neon usage ledger. Limits are read from your active plan entitlements.</p>
      </div>
    </main>
  );
}
