"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Provider = { id: string; name: string };
type Connection = {
  id: string;
  providerId: string;
  providerName: string;
  displayName: string;
  modelId: string;
  enabled: boolean;
  status: "untested" | "connected" | "failed";
  lastTestedAt: string | null;
  lastErrorCode: string | null;
};

const providers: Provider[] = [
  { id: "openai", name: "ChatGPT / OpenAI" },
  { id: "anthropic", name: "Anthropic Claude" },
  { id: "google", name: "Google Gemini" },
  { id: "xai", name: "xAI Grok" },
  { id: "openrouter", name: "OpenRouter · multi-provider" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "groq", name: "Groq" },
  { id: "mistral", name: "Mistral" },
  { id: "together", name: "Together AI" },
  { id: "fireworks", name: "Fireworks AI" },
];

function date(value: string | null) {
  if (!value) return "Not tested";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not tested" : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function AIConnectionsSection() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerId, setProviderId] = useState("openai");
  const [displayName, setDisplayName] = useState("OpenAI primary");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ai-connections", { cache: "no-store" });
      const result = await response.json() as { connections?: Connection[]; message?: string };
      if (!response.ok) throw new Error(result.message || "AI connections could not be loaded.");
      setConnections(result.connections ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI connections are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/ai-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, displayName, modelId, apiKey }),
      });
      const result = await response.json() as { connection?: Connection; message?: string };
      if (!response.ok || !result.connection) throw new Error(result.message || "Provider connection failed.");
      setConnections((current) => [...current, result.connection!].sort((a, b) => a.providerName.localeCompare(b.providerName)));
      setApiKey("");
      setNotice(`${result.connection.providerName} connected and tested successfully. The API key is encrypted and will not be shown again.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The provider could not be connected.");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(connection: Connection) {
    if (busyId) return;
    setBusyId(connection.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/ai-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: connection.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Provider test failed.");
      setNotice(`${connection.providerName} connection test passed.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection test failed.");
      await refresh();
    } finally {
      setBusyId("");
    }
  }

  async function removeConnection(connection: Connection) {
    if (busyId || !window.confirm(`Remove the saved ${connection.providerName} connection “${connection.displayName}”? Users will no longer be able to select its model.`)) return;
    setBusyId(connection.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/ai-connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Connection could not be removed.");
      setConnections((current) => current.filter((item) => item.id !== connection.id));
      setNotice(`${connection.displayName} has been disconnected.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The connection could not be removed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">AI provider control</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Connect the AI models you use.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Connect providers once from Super Admin. Their tested models then appear in the ChatGPT-style model selector for your signed-in users. BALMZ AI sends requests server-side and keeps provider credentials out of the browser.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Connected models</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{connections.length}</p><p className="mt-1 text-[10px] text-slate-500">Verified provider entries</p></div>
        </div>
      </section>

      {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
          <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6"><h3 className="text-sm font-semibold text-white">Add a provider connection</h3><p className="mt-1 text-xs text-slate-500">Each provider key is tested before it is saved.</p></div>
          <form onSubmit={connect} className="space-y-4 p-5 sm:p-6">
            <label className="block"><span className="text-[11px] font-medium text-slate-400">AI provider</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50">{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
            <label className="block"><span className="text-[11px] font-medium text-slate-400">Connection name</span><input required minLength={2} maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Claude production" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /></label>
            <label className="block"><span className="text-[11px] font-medium text-slate-400">Model ID from provider</span><input required minLength={2} maxLength={180} value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="Enter the exact model ID from the provider's console" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /></label>
            <label className="block"><span className="text-[11px] font-medium text-slate-400">Provider API key</span><input required type="password" autoComplete="new-password" minLength={10} maxLength={4096} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste the provider API key here" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /></label>
            <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-4"><p className="text-xs font-semibold text-amber-100">Provider test request</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Connect & test sends one tiny “reply OK” request to the selected model. The provider may charge a small amount for that request. No key is saved if the test fails.</p></div>
            <button type="submit" disabled={saving || !apiKey.trim() || !modelId.trim()} className="min-h-11 w-full rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Testing and saving…" : "Connect & test provider"}</button>
          </form>
        </div>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
            <div className="border-b border-white/[0.07] px-5 py-4"><h3 className="text-sm font-semibold text-white">Connected providers</h3><p className="mt-1 text-xs text-slate-500">These models appear in the client workplace.</p></div>
            {loading ? <div className="p-7 text-center text-xs text-slate-500">Loading provider status…</div>
              : connections.length ? <div className="divide-y divide-white/[0.055]">{connections.map((connection) => <article key={connection.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold text-white">{connection.displayName}</p><p className="mt-1 text-[10px] text-slate-500">{connection.providerName} · {connection.modelId}</p></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] uppercase tracking-wider ${connection.status === "connected" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : connection.status === "failed" ? "border-rose-400/20 bg-rose-400/10 text-rose-300" : "border-white/10 bg-white/5 text-slate-400"}`}>{connection.status}</span></div>
                <p className="text-[10px] text-slate-600">Last tested: {date(connection.lastTestedAt)}</p>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void testConnection(connection)} disabled={Boolean(busyId)} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-300 hover:border-[var(--balmz-orange)]/40 disabled:opacity-40">{busyId === connection.id ? "Testing…" : "Test again"}</button><button type="button" onClick={() => void removeConnection(connection)} disabled={Boolean(busyId)} className="min-h-9 rounded-lg border border-rose-400/15 px-3 text-[10px] font-semibold text-rose-300 hover:bg-rose-400/[0.06] disabled:opacity-40">Disconnect</button></div>
              </article>)}</div>
              : <div className="p-7 text-center"><p className="text-xs font-medium text-slate-300">No extra AI providers connected</p><p className="mt-2 text-[10px] text-slate-500">Add the first provider to make its model available in Chat.</p></div>}
          </section>

          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-5">
            <h3 className="text-sm font-semibold text-white">Supported AI connections</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">{providers.map((provider) => <div key={provider.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] text-slate-300">{provider.name}</div>)}</div>
            <p className="mt-3 text-[10px] leading-5 text-slate-500">OpenRouter exposes a wide range of model providers behind one key. Provider model availability, pricing, limits and access are controlled by each provider account.</p>
          </section>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <h3 className="text-sm font-semibold text-white">Credential protection</h3>
        <ul className="mt-3 grid gap-2 text-[11px] leading-5 text-slate-400 sm:grid-cols-2">
          <li>• API keys are encrypted with AES-256-GCM before they are stored in Neon.</li>
          <li>• The encryption key is derived from the existing server-only BETTER_AUTH_SECRET.</li>
          <li>• The browser only receives connection name, provider, model ID and test status.</li>
          <li>• Provider calls run from the BALMZ AI server; keys are not saved in browser storage.</li>
          <li>• Chat remains behind the existing subscription and ai_messages allowance checks.</li>
          <li>• Connecting providers does not make their models free; provider API usage may be billed separately.</li>
        </ul>
      </section>
    </div>
  );
}
