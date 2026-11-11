"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type ApiKeyRecord = {
  id: string;
  name: string;
  environment: "demo" | "live";
  key_prefix: string;
  lastFour: string;
  scopes: string[];
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
};

function date(value: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [name, setName] = useState("BALMZ integration");
  const [environment, setEnvironment] = useState<"demo" | "live">("demo");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [newKey, setNewKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/api-keys", { cache: "no-store" });
      const result = await response.json() as { keys?: ApiKeyRecord[]; message?: string };
      if (!response.ok) throw new Error(result.message || "API keys could not be loaded.");
      setKeys(result.keys ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "API key list is unavailable.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true); setError(""); setNotice(""); setNewKey("");
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, environment, scopes: ["platform:read"] }),
      });
      const result = await response.json() as { key?: string; warning?: string; message?: string };
      if (!response.ok || !result.key) throw new Error(result.message || "API key could not be created.");
      setNewKey(result.key);
      setNotice(result.warning || "Copy your API key now. It cannot be viewed again.");
      setName("BALMZ integration");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "API key creation failed.");
    } finally { setCreating(false); }
  }

  async function revoke(item: ApiKeyRecord) {
    if (busyId || !window.confirm("Revoke “" + item.name + "”? Requests using this key will stop working immediately.")) return;
    setBusyId(item.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }),
      });
      if (!response.ok) throw new Error("The API key could not be revoked.");
      setKeys((current) => current.map((key) => key.id === item.id ? { ...key, status: "revoked" } : key));
      setNotice("API key revoked successfully.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revocation failed.");
    } finally { setBusyId(""); }
  }

  async function copyNewKey() {
    try {
      await navigator.clipboard.writeText(newKey);
      setNotice("New API key copied. Store it in a secret manager or your server environment.");
    } catch {
      setError("Clipboard unavailable. Select and copy the key manually before closing this page.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5 sm:p-7">
        <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">Developer credentials</span>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Create BALMZ API keys.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Generate separate Demo and Live keys for applications that call BALMZ AI. Secrets are shown only once; the database stores a SHA-256 hash, not the raw key.</p>
      </section>

      {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}
      {newKey ? <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.045] p-5"><p className="text-xs font-semibold text-emerald-200">New API key — copy it now</p><div className="mt-3 flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white">{newKey}</code><button type="button" onClick={() => void copyNewKey()} className="min-h-10 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a]">Copy key</button></div><p className="mt-3 text-[10px] leading-5 text-slate-500">The full key will not be displayed again. Use Authorization: Bearer YOUR_KEY. The current scope is platform:read.</p></section> : null}

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
        <div className="border-b border-white/[0.07] px-5 py-4"><h3 className="text-sm font-semibold text-white">Generate a new key</h3><p className="mt-1 text-xs text-slate-500">Demo and Live keys have distinct prefixes and isolated records.</p></div>
        <form onSubmit={createKey} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-end">
          <label className="block"><span className="text-[10px] text-slate-400">Key name</span><input required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label>
          <label className="block"><span className="text-[10px] text-slate-400">Environment</span><select value={environment} onChange={(event) => setEnvironment(event.target.value as "demo" | "live")} className="mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none"><option value="demo">Demo / Test</option><option value="live">Live / Production</option></select></label>
          <button type="submit" disabled={creating} className="min-h-11 rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-semibold text-[#17100a] disabled:opacity-40">{creating ? "Generating…" : "Create API key"}</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4"><div><h3 className="text-sm font-semibold text-white">Generated keys</h3><p className="mt-1 text-xs text-slate-500">Prefix, usage time and status only. Full key values are never stored.</p></div><button onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 disabled:opacity-40">Refresh</button></div>
        {loading ? <p className="p-7 text-xs text-slate-500">Loading keys…</p> : keys.length ? <div className="divide-y divide-white/[0.055]">{keys.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold text-white">{item.name}</p><span className={"rounded-full border px-2 py-0.5 text-[9px] uppercase " + (item.environment === "live" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-200")}>{item.environment}</span><span className="text-[9px] text-slate-500">{item.status}</span></div><p className="mt-1 font-mono text-[10px] text-slate-400">{item.key_prefix}…{item.lastFour}</p><p className="mt-1 text-[10px] text-slate-600">Created {date(item.created_at)} · Last used {date(item.last_used_at)} · Scope: {item.scopes.join(", ")}</p></div>{item.status === "active" ? <button type="button" onClick={() => void revoke(item)} disabled={Boolean(busyId)} className="min-h-9 rounded-lg border border-rose-400/15 px-3 text-[10px] font-semibold text-rose-300 disabled:opacity-40">{busyId === item.id ? "Revoking…" : "Revoke"}</button> : null}</article>)}</div> : <p className="p-8 text-center text-xs text-slate-500">No API keys created yet.</p>}
      </section>
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"><h3 className="text-sm font-semibold text-white">API endpoint check</h3><p className="mt-2 text-xs text-slate-400">Use a generated key with this example to check whether it is active.</p><pre className="mt-3 overflow-x-auto rounded-xl bg-black/30 p-4 text-[10px] leading-5 text-slate-300">{"curl https://balmz-ai.onrender.com/api/v1/health \\n  -H \"Authorization: Bearer YOUR_BALMZ_API_KEY\""}</pre></section>
    </div>
  );
}
