"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Account = { id: string; name: string; subtype: string | null; mask: string | null };
type Connection = { id: string; institutionName: string; environment: string; status: string; createdAt: string; accounts: Account[] };

export function ManageBankConnections() {
  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/banking/connections", { cache: "no-store" });
      const result = await response.json() as { connections?: Connection[]; message?: string };
      if (!response.ok) throw new Error(result.message || "Bank connections could not be loaded.");
      setItems(result.connections ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bank connections are unavailable.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function disconnect(item: Connection) {
    if (busy || !window.confirm("Disconnect " + item.institutionName + " from BALMZ AI? Any attached ACH funding source will be removed first.")) return;
    setBusy(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/banking/remove-connection", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectionId: item.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Bank connection could not be removed.");
      setNotice("Bank connection disconnected.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bank disconnect failed.");
    } finally { setBusy(""); }
  }

  return <main className="min-h-[100dvh] bg-[#080c14] pb-12 text-slate-100">
    <header className="flex min-h-[68px] items-center justify-between border-b border-white/[0.07] px-4 sm:px-8">
      <div><h1 className="text-sm font-semibold text-white">Manage bank connections</h1><p className="mt-1 text-[10px] text-slate-500">Review or disconnect linked institutions</p></div>
      <Link href="/dashboard/banking" className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300">Back</Link>
    </header>
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-8">
      {error ? <p role="alert" className="rounded-xl border border-rose-400/20 p-3 text-xs text-rose-300">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-400/20 p-3 text-xs text-emerald-300">{notice}</p> : null}
      {loading ? <p className="text-xs text-slate-500">Loading linked banks…</p> : items.length ? items.map((item) => <article key={item.id} className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">{item.institutionName}</p><p className="mt-1 text-[10px] text-slate-500">{item.environment} · {item.status}</p></div><button type="button" onClick={() => void disconnect(item)} disabled={Boolean(busy)} className="min-h-9 rounded-lg border border-rose-400/20 px-3 text-[10px] text-rose-300 disabled:opacity-40">{busy === item.id ? "Disconnecting…" : "Disconnect bank"}</button></div>
        <div className="mt-3 space-y-2">{item.accounts.map((account) => <p key={account.id} className="rounded-lg bg-black/20 p-3 text-xs text-slate-300">{account.name} · {account.subtype || "account"} · •••• {account.mask || "—"}</p>)}</div>
      </article>) : <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">No bank connections are currently saved.</p>}
      <button type="button" onClick={() => void refresh()} className="min-h-10 rounded-xl border border-white/10 px-4 text-xs text-slate-300">Refresh</button>
    </div>
  </main>;
}
