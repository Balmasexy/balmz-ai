"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type Provider = { id: string; name: string };
type ProviderModel = { id: string; label: string };
type EnvironmentProvider = { providerId: string; providerName: string; configured: boolean; endpointConfigured?: boolean | null; source: string | null; defaultModelId?: string | null };
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
  endpointConfigured?: boolean;
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
  { id: "general", name: "General Language API · OpenAI-compatible" },
];

function date(value: string | null) {
  if (!value) return "Not tested";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not tested" : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function AIConnectionsSection() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [environmentProviders, setEnvironmentProviders] = useState<EnvironmentProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerId, setProviderId] = useState("openai");
  const [displayName, setDisplayName] = useState("OpenAI primary");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [customModelMode, setCustomModelMode] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ai-connections", { cache: "no-store" });
      const result = await response.json() as { connections?: Connection[]; environmentProviders?: EnvironmentProvider[]; message?: string };
      if (!response.ok) throw new Error(result.message || "AI connections could not be loaded.");
      setConnections(result.connections ?? []);
      setEnvironmentProviders(result.environmentProviders ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI connections are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function loadModels() {
    if (loadingModels) return;
    const serverCredential = environmentProviders.some((item) => item.providerId === providerId && item.configured);
    const saved = connections.find((item) => item.providerId === providerId && item.status === "connected");
    const endpointAvailable = providerId !== "general"
      || Boolean(endpointUrl.trim())
      || environmentProviders.some((item) => item.providerId === providerId && item.endpointConfigured)
      || Boolean(saved?.endpointConfigured);
    if (!apiKey.trim() && !serverCredential && !saved) {
      setError("No credential is configured for this provider yet. Configure its server environment secret, or enter an API key once below.");
      return;
    }
    if (!endpointAvailable) {
      setError("Enter a public HTTPS base URL for the General Language API, or configure GENERAL_LANGUAGE_API_BASE_URL in Render.");
      return;
    }
    setLoadingModels(true);
    setError("");
    setNotice("");
    setAvailableModels([]);
    try {
      const response = await fetch("/api/admin/ai-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list-models", providerId, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(endpointUrl.trim() ? { endpointUrl: endpointUrl.trim() } : {}) }),
      });
      const result = await response.json() as { error?: string; models?: ProviderModel[]; message?: string; retryAfterSeconds?: number };
      if (!response.ok || !Array.isArray(result.models)) {
        if (result.error === "AI_PROVIDER_RATE_LIMITED") {
          // The live catalogue may be rate-limited. Allow manual model ID entry
          // so the administrator does not repeatedly call the same endpoint.
          setCustomModelMode(true);
          setModelId("");
        }
        throw new Error(result.message || "The provider model list could not be loaded.");
      }
      setAvailableModels(result.models);
      setCustomModelMode(false);
      if (result.models.length) {
        setModelId((current) => result.models!.some((item) => item.id === current)
          ? current
          : result.models![0].id);
        setNotice(`${result.models.length} models loaded from ${providers.find((item) => item.id === providerId)?.name ?? "the provider"}.`);
      } else {
        setModelId("");
        setNotice(result.message || "No chat models were returned. You can enter an exact model ID manually.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The provider model list could not be loaded.");
    } finally {
      setLoadingModels(false);
    }
  }

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
        body: JSON.stringify({ providerId, displayName, modelId, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), ...(endpointUrl.trim() ? { endpointUrl: endpointUrl.trim() } : {}) }),
      });
      const result = await response.json() as { connection?: Connection; message?: string };
      if (!response.ok || !result.connection) throw new Error(result.message || "Provider connection failed.");
      setConnections((current) => [...current, result.connection!].sort((a, b) => a.providerName.localeCompare(b.providerName)));
      setApiKey("");
      const credentialSource = apiKey.trim() ? "the key supplied for this connection" : "the server-side/saved credential";
      setNotice(`${result.connection.providerName} connected and tested successfully using ${credentialSource}. No API key was needed in this form.`);
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
      const result = await response.json() as { error?: string; message?: string; retryAfterSeconds?: number };
      if (!response.ok) throw new Error(result.message || "Provider test failed.");
      setNotice(`${connection.providerName} connection test passed.`);
      await refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Connection test failed.";
      await refresh();
      setError(message);
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
            <p className="mt-2 text-xs leading-5 text-slate-500">General Language API supports public HTTPS endpoints implementing the OpenAI chat-completions format. Configure its endpoint, model ID and key once in Render.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Connected models</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{connections.length}</p><p className="mt-1 text-[10px] text-slate-500">Verified provider entries</p></div>
        </div>
      </section>

      {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
          <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6"><h3 className="text-sm font-semibold text-white">Add a provider connection</h3><p className="mt-1 text-xs text-slate-500">Uses the server-configured credential automatically; no API key needs to be pasted when one is already available.</p></div>
          <form onSubmit={connect} className="space-y-4 p-5 sm:p-6">
            <label className="block"><span className="text-[11px] font-medium text-slate-400">AI provider</span><select value={providerId} onChange={(event) => { const nextProvider = event.target.value; setProviderId(nextProvider); setAvailableModels([]); setModelId(environmentProviders.find((item) => item.providerId === nextProvider)?.defaultModelId ?? ""); setEndpointUrl(""); setCustomModelMode(false); setNotice(""); setError(""); }} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50">{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
            <label className="block"><span className="text-[11px] font-medium text-slate-400">Connection name</span><input required minLength={2} maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Claude production" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /></label>
            {providerId === "general" ? <label className="block"><span className="text-[11px] font-medium text-slate-400">General Language API base URL</span><input type="url" maxLength={500} value={endpointUrl} onChange={(event) => { setEndpointUrl(event.target.value); setAvailableModels([]); setModelId(""); }} placeholder="https://api.vendor.com/v1 · leave blank to use Render setting" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /><p className="mt-1 text-[10px] leading-5 text-slate-500">Must be a public HTTPS endpoint implementing OpenAI-compatible /models and /chat/completions. A configured Render endpoint is used when this field is blank.</p></label> : null}
            
            <div className="space-y-2">
              <label className="block"><span className="text-[11px] font-medium text-slate-400">Optional provider API key</span><input type="password" autoComplete="new-password" minLength={10} maxLength={4096} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setAvailableModels([]); setModelId(""); setCustomModelMode(false); }} placeholder="Not required when a server/saved credential is available" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /><p className="mt-1 text-[10px] text-slate-500">{environmentProviders.find((item) => item.providerId === providerId && item.configured)?.source ?? (connections.some((item) => item.providerId === providerId && item.status === "connected") ? "Saved encrypted connection" : "No server-side credential detected")}{providerId === "general" ? " · GENERAL_LANGUAGE_API_BASE_URL and GENERAL_LANGUAGE_API_MODEL are also required" : ""}</p></label>
              <button type="button" onClick={() => void loadModels()} disabled={loadingModels || (!apiKey.trim() && !environmentProviders.some((item) => item.providerId === providerId && item.configured) && !connections.some((item) => item.providerId === providerId && item.status === "connected")) || (providerId === "general" && !endpointUrl.trim() && !environmentProviders.some((item) => item.providerId === providerId && item.endpointConfigured) && !connections.some((item) => item.providerId === providerId && item.status === "connected" && item.endpointConfigured))} className="min-h-10 rounded-xl border border-[var(--balmz-orange)]/30 bg-[var(--balmz-orange)]/[0.08] px-4 text-xs font-semibold text-[var(--balmz-orange)] transition hover:bg-[var(--balmz-orange)]/[0.14] disabled:cursor-not-allowed disabled:opacity-40">{loadingModels ? "Loading provider models…" : "Load available models"}</button>
              <p className="text-[10px] leading-5 text-slate-500">Uses a saved connection or Render environment secret automatically. A key is only needed once when no server credential exists.</p>
            </div>
            <label className="block"><span className="text-[11px] font-medium text-slate-400">Select model</span><select value={customModelMode ? "__custom__" : modelId} onChange={(event) => { const value = event.target.value; setCustomModelMode(value === "__custom__"); setModelId(value === "__custom__" ? "" : value); }} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50"><option value="">{availableModels.length ? "Choose a model" : "Load available models first"}</option>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.label === model.id ? model.id : `${model.label} · ${model.id}`}</option>)}<option value="__custom__">Enter a custom model ID…</option></select></label>
            {customModelMode ? <label className="block"><span className="text-[11px] font-medium text-slate-400">Custom model ID</span><input required minLength={2} maxLength={180} value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="Enter the exact model ID from the provider" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /></label> : null}
            <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-4"><p className="text-xs font-semibold text-amber-100">Provider test request</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Connect & test sends one tiny “reply OK” request to the selected model. The provider may charge a small amount for that request. No key is saved if the test fails.</p></div>
            <button type="submit" disabled={saving || loadingModels || !modelId.trim() || (!apiKey.trim() && !environmentProviders.some((item) => item.providerId === providerId && item.configured) && !connections.some((item) => item.providerId === providerId && item.status === "connected")) || (providerId === "general" && !endpointUrl.trim() && !environmentProviders.some((item) => item.providerId === providerId && item.endpointConfigured) && !connections.some((item) => item.providerId === providerId && item.status === "connected" && item.endpointConfigured))} className="min-h-11 w-full rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Testing and saving…" : "Connect using available credential"}</button>
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
