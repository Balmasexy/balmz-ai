"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Account = { id: string; name: string; type: string | null; subtype: string | null; mask: string | null };
type Connection = { id: string; institutionName: string; status: string; accounts: Account[] };
type Source = { id: string; institutionName: string; accountType: string; mask: string | null; status: string; achEnabled: boolean };
type Customer = { id: string; environment: string; customer_type: string; provider_status: string } | null;

export function AchActivationWorkspace() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [customer, setCustomer] = useState<Customer>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [c, s, i] = await Promise.all([
        fetch("/api/banking/connections", { cache: "no-store" }),
        fetch("/api/banking/funding-sources", { cache: "no-store" }),
        fetch("/api/banking/customer", { cache: "no-store" }),
      ]);
      const [cd, sd, id] = await Promise.all([c.json(), s.json(), i.json()]) as [
        { connections?: Connection[]; message?: string },
        { fundingSources?: Source[]; message?: string },
        { customer?: Customer; message?: string }
      ];
      if (!c.ok || !s.ok || !i.ok) throw new Error(cd.message || sd.message || id.message || "ACH setup could not be loaded.");
      setConnections(cd.connections ?? []);
      setSources(sd.fundingSources ?? []);
      setCustomer(id.customer ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ACH setup is unavailable.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function activate(connection: Connection, account: Account) {
    const busyId = connection.id + ":" + account.id;
    if (busy) return;
    setBusy(busyId); setError(""); setNotice("");
    try {
      const response = await fetch("/api/banking/funding-sources/activate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id, accountId: account.id }),
      });
      const result = await response.json() as { success?: boolean; message?: string; achVerified?: boolean };
      if (!response.ok || !result.success) throw new Error(result.message || "ACH funding source setup failed.");
      setNotice(result.message || "ACH funding source setup completed.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ACH funding source setup failed.");
    } finally { setBusy(""); }
  }

  return (
    <main className="min-h-[100dvh] bg-[#080c14] pb-12 text-slate-100">
      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <div><h1 className="text-sm font-semibold text-white">ACH funding sources</h1><p className="mt-1 text-[10px] text-slate-500">NMI Money Movement · Plaid Auth</p></div>
        <Link href="/dashboard/banking" className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300">Back to bank links</Link>
      </header>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-8 sm:py-9">
        <section className="rounded-3xl border border-[var(--balmz-orange)]/20 bg-gradient-to-br from-[#151d2a] to-[#0b111c] p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--balmz-orange)]">ACH connection</p>
          <h2 className="mt-3 text-xl font-semibold text-white">Activate an eligible bank account</h2>
          <p className="mt-2 text-xs leading-6 text-slate-400">The server exchanges the selected account for a short-lived Plaid processor token and sends that token directly to the transfer provider. BALMZ AI does not retrieve or store the bank account or routing number.</p>
          <p className="mt-3 text-xs text-slate-300">Transfer profile: {customer ? customer.provider_status + " · " + customer.customer_type : "Not created"}</p>
        </section>
        {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs text-rose-300">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-xs text-emerald-300">{notice}</p> : null}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5">
          <h3 className="text-sm font-semibold text-white">Your connected bank accounts</h3>
          {!connections.length ? <p className="mt-3 text-xs text-slate-500">Connect a bank on the Bank Connections page first.</p> : <div className="mt-4 space-y-3">
            {connections.map((connection) => <article key={connection.id} className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-xs font-semibold text-white">{connection.institutionName}</p>
              <div className="mt-3 space-y-2">{connection.accounts.map((account) => {
                const existing = sources.find((source) => source.institutionName === connection.institutionName && source.accountType === account.subtype && source.mask === account.mask);
                const eligible = account.type === "depository" && (account.subtype === "checking" || account.subtype === "savings");
                return <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/20 p-3">
                  <div><p className="text-xs text-slate-200">{account.name}</p><p className="mt-1 text-[10px] text-slate-500">{account.subtype || account.type} · •••• {account.mask || "—"}</p></div>
                  {existing ? <span className="text-[10px] text-emerald-300">{existing.achEnabled ? "ACH verified" : existing.status}</span>
                    : <button type="button" disabled={!eligible || Boolean(busy) || !customer} onClick={() => void activate(connection, account)} className="min-h-9 rounded-lg bg-[var(--balmz-orange)] px-3 text-[10px] font-bold text-[#17100a] disabled:opacity-40">{busy === connection.id + ":" + account.id ? "Activating…" : "Add ACH funding source"}</button>}
                </div>;
              })}</div>
            </article>)}
          </div>}
        </section>
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <h3 className="text-sm font-semibold text-amber-200">Transfers are still disabled</h3>
          <p className="mt-2 text-xs leading-6 text-slate-400">A provider funding source may be pending or verified. That does not authorize BALMZ AI to send or receive money. Transfers require provider identity checks, the platform review and written NMI production approval. The application keeps transfer initiation off until those conditions have been verified.</p>
        </section>
        <button type="button" onClick={() => void refresh()} className="min-h-10 rounded-xl border border-white/10 px-4 text-xs text-slate-300">Refresh status</button>
      </div>
    </main>
  );
}
