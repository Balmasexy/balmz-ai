"use client";

import { useCallback, useEffect, useState } from "react";

type Credential = {
  id: string; provider: "plaid" | "money-movement"; label: string;
  environment: "demo" | "live"; status: string; lastTestedAt: string | null; updatedAt: string;
};

export function BankingVaultSection() {
  const [items, setItems] = useState<Credential[]>([]);
  const [environment, setEnvironment] = useState<"demo" | "live">("demo");
  const [plaidClientId, setPlaidClientId] = useState("");
  const [plaidSecret, setPlaidSecret] = useState("");
  const [movementKey, setMovementKey] = useState("");
  const [movementSecret, setMovementSecret] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [transfersEnabled, setTransfersEnabled] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/banking-vault", { cache: "no-store" });
      const result = await response.json() as { credentials?: Credential[]; transfersEnabled?: boolean; message?: string };
      if (!response.ok) throw new Error(result.message || "The banking vault could not be loaded.");
      setItems(result.credentials ?? []);
      setTransfersEnabled(result.transfersEnabled === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The banking vault is unavailable.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function save(provider: "plaid" | "money-movement") {
    if (busy) return;
    setBusy("save-" + provider); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/banking-vault", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provider === "plaid"
          ? { action: "save", provider, environment, clientId: plaidClientId, secret: plaidSecret }
          : { action: "save", provider, environment, key: movementKey, secret: movementSecret }),
      });
      const result = await response.json() as { message?: string; credential?: Credential };
      if (!response.ok || !result.credential) throw new Error(result.message || "The credentials could not be saved.");
      setNotice((provider === "plaid" ? "Plaid" : "NMI Money Movement") + " credentials passed their connection test and were encrypted.");
      setPlaidSecret(""); setMovementSecret(""); setMovementKey("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Credential save failed.");
    } finally { setBusy(""); }
  }

  async function test(item: Credential) {
    if (busy) return;
    setBusy(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/banking-vault", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", id: item.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Connection test failed.");
      setNotice(item.label + " passed its provider connection test.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection test failed.");
    } finally { setBusy(""); }
  }

  async function remove(item: Credential) {
    if (busy || !window.confirm("Remove " + item.label + " from the BALMZ AI vault? This does not revoke the provider key.")) return;
    setBusy(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/banking-vault", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) throw new Error("The credential could not be removed.");
      setNotice(item.label + " was removed from the vault.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Credential removal failed.");
    } finally { setBusy(""); }
  }

  const plaid = items.filter((item) => item.provider === "plaid" && item.environment === environment);
  const movement = items.filter((item) => item.provider === "money-movement" && item.environment === environment);
  const field = "mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50 placeholder:text-slate-600";

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--balmz-orange)]/20 bg-gradient-to-br from-[#171b22] to-[#0d1420] p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--balmz-orange)]">Restricted · Super Admin only</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Banking Secret Vault</h2>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-400">Plaid handles bank sign-in and one-time verification inside Plaid Link. NMI Money Movement is the proposed ACH processor. Credentials are encrypted server-side and never returned to the client.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEnvironment("demo")} className={"min-h-10 rounded-xl border px-4 text-xs font-semibold " + (environment === "demo" ? "border-[var(--balmz-orange)]/40 bg-[var(--balmz-orange)]/10 text-[var(--balmz-orange)]" : "border-white/10 text-slate-400")}>Sandbox</button>
          <button type="button" onClick={() => setEnvironment("live")} className={"min-h-10 rounded-xl border px-4 text-xs font-semibold " + (environment === "live" ? "border-[var(--balmz-orange)]/40 bg-[var(--balmz-orange)]/10 text-[var(--balmz-orange)]" : "border-white/10 text-slate-400")}>Production</button>
        </div>
      </section>

      {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs text-rose-300">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-xs text-emerald-300">{notice}</p> : null}

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-white">Plaid</h3><p className="mt-1 text-xs text-slate-500">Client ID + matching {environment === "demo" ? "Sandbox Secret" : "Production Secret"}</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-400">{plaid.length ? "Credential saved" : "Not configured"}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Plaid Client ID<input autoComplete="off" value={plaidClientId} onChange={(event) => setPlaidClientId(event.target.value)} placeholder="Client ID" className={field} /></label>
          <label className="text-xs text-slate-400">{environment === "demo" ? "Plaid Sandbox Secret" : "Plaid Production Secret"}<input type="password" autoComplete="new-password" value={plaidSecret} onChange={(event) => setPlaidSecret(event.target.value)} placeholder="Provider secret" className={field} /></label>
        </div>
        <button type="button" onClick={() => void save("plaid")} disabled={Boolean(busy) || !plaidClientId.trim() || !plaidSecret.trim()} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-bold text-[#17100a] disabled:opacity-40">{busy === "save-plaid" ? "Testing and encrypting…" : "Test & save Plaid " + (environment === "demo" ? "Sandbox" : "Production")}</button>
        <div className="mt-4 space-y-2">{loading ? <p className="text-xs text-slate-500">Loading saved credentials…</p> : plaid.map((item) => <CredentialRow key={item.id} item={item} busy={busy} onTest={test} onRemove={remove} />)}</div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-white">NMI Money Movement</h3><p className="mt-1 text-xs text-slate-500">Provider API key + API secret</p></div><span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-slate-400">{movement.length ? "Credential saved" : "Not configured"}</span></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">API key<input autoComplete="off" value={movementKey} onChange={(event) => setMovementKey(event.target.value)} placeholder="Provider API key" className={field} /></label>
          <label className="text-xs text-slate-400">API secret<input type="password" autoComplete="new-password" value={movementSecret} onChange={(event) => setMovementSecret(event.target.value)} placeholder="Provider API secret" className={field} /></label>
        </div>
        <button type="button" onClick={() => void save("money-movement")} disabled={Boolean(busy) || !movementKey.trim() || !movementSecret.trim()} className="mt-4 min-h-11 w-full rounded-xl border border-[var(--balmz-orange)]/30 bg-[var(--balmz-orange)]/[0.08] px-4 text-xs font-semibold text-[var(--balmz-orange)] disabled:opacity-40">{busy === "save-money-movement" ? "Testing and encrypting…" : "Test & save NMI " + (environment === "demo" ? "Sandbox" : "Production")}</button>
        <div className="mt-4 space-y-2">{loading ? null : movement.map((item) => <CredentialRow key={item.id} item={item} busy={busy} onTest={test} onRemove={remove} />)}</div>
      </section>

      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
        <h3 className="text-sm font-semibold text-amber-200">Production activation gate</h3>
        <p className="mt-2 text-xs leading-6 text-slate-400">Production money movement remains disabled until NMI completes its integration and risk review and sends written go-live approval. A successful Sandbox credential test is not approval to move real money.</p>
        <p className="mt-3 text-xs font-semibold text-slate-300">Production transfer flag: {transfersEnabled ? "Approval flag detected; other provider checks still apply" : "OFF"}</p>
      </section>
    </div>
  );
}

function CredentialRow({ item, busy, onTest, onRemove }: {
  item: Credential; busy: string;
  onTest: (item: Credential) => void; onRemove: (item: Credential) => void;
}) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3">
    <div className="min-w-0"><p className="text-xs font-medium text-white">{item.label}</p><p className="mt-1 text-[10px] text-slate-500">{item.status} · Last tested {item.lastTestedAt ? new Date(item.lastTestedAt).toLocaleString() : "not tested"}</p></div>
    <div className="flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => onTest(item)} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] text-slate-300 disabled:opacity-40">{busy === item.id ? "Testing…" : "Test"}</button><button type="button" disabled={Boolean(busy)} onClick={() => onRemove(item)} className="min-h-9 rounded-lg border border-rose-400/20 px-3 text-[10px] text-rose-300 disabled:opacity-40">Remove</button></div>
  </div>;
}
