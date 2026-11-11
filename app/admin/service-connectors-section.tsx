"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type ServiceId = "paystack" | "coingecko" | "chartgpt" | "github" | "render" | "neon" | "notion" | "agentic-ai" | "notes-ai" | "custom";
type Environment = "demo" | "live";
type CatalogItem = {
  id: ServiceId; name: string; category: string; description: string; keyRequired: boolean;
  demoLive: boolean; url: string; keyHelp: string; capabilities: string[];
};
type Connection = {
  id: string; serviceId: ServiceId; serviceName: string; displayName: string; environment: Environment;
  status: string; lastTestedAt: string | null; lastErrorCode: string | null;
};
type EnvStatus = { serviceId: ServiceId; environment: Environment; configured: boolean; source: string | null };
type Repository = { id: number; name: string; fullName: string; private: boolean; url: string; defaultBranch: string; updatedAt: string; description: string | null };
type PaymentMode = { environment: Environment; enabled: boolean; verified_at: string | null; enabled_at: string | null; credential: { status: string; last_tested_at: string | null } | null };

const serviceLogos: Record<ServiceId, string> = {
  paystack: "P", coingecko: "CG", chartgpt: "CH", github: "GH", render: "R", neon: "N", notion: "NO", "agentic-ai": "A", "notes-ai": "NA", custom: "API",
};
function date(value: string | null) {
  if (!value) return "Not tested";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not tested" : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}
function Status({ value }: { value: string }) {
  const tone = value === "connected"
    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
    : value === "failed"
      ? "border-rose-400/20 bg-rose-400/10 text-rose-300"
      : "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return <span className={`rounded-full border px-2 py-1 text-[9px] uppercase tracking-wider ${tone}`}>{value}</span>;
}

export function ServiceConnectorsSection() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [environmentStatuses, setEnvironmentStatuses] = useState<EnvStatus[]>([]);
  const [selectedId, setSelectedId] = useState<ServiceId>("github");
  const [environment, setEnvironment] = useState<Environment>("live");
  const [displayName, setDisplayName] = useState("GitHub primary");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentResults, setAgentResults] = useState<Array<{ name: string; description: string; url: string; category: string; mcpSupport: boolean | null; openSource: boolean | null }>>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [paymentModeBusy, setPaymentModeBusy] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/service-connectors", { cache: "no-store" });
      const payload = await response.json() as { catalog?: CatalogItem[]; connections?: Connection[]; environmentStatuses?: EnvStatus[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "Connectors could not be loaded.");
      setCatalog(payload.catalog ?? []);
      setConnections(payload.connections ?? []);
      setEnvironmentStatuses(payload.environmentStatuses ?? []);
      const modesResponse = await fetch("/api/admin/payments/environment", { cache: "no-store" });
      const modesPayload = await modesResponse.json() as { modes?: PaymentMode[] };
      if (modesResponse.ok) setPaymentModes(modesPayload.modes ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connectors are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selected = catalog.find((service) => service.id === selectedId) ?? null;
  const filtered = useMemo(() => catalog.filter((service) =>
    [service.name, service.category, service.description].join(" ").toLowerCase().includes(search.toLowerCase()),
  ), [catalog, search]);
  const selectedConnections = connections.filter((item) => item.serviceId === selectedId);
  const selectedEnvironmentStatus = environmentStatuses.find((item) => item.serviceId === selectedId && item.environment === environment);
  const visibleConnections = selectedConnections.filter((item) => item.environment === environment);

  useEffect(() => {
    if (!catalog.some((item) => item.id === selectedId)) return;
    const label = catalog.find((item) => item.id === selectedId)?.name ?? "Service";
    setDisplayName(`${label} primary`);
    setToken("");
    setApiKey("");
    setPublicKey("");
    setBaseUrl("");
    setModelId("");
    setRepos([]);
    setNotice("");
  }, [selectedId, catalog]);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    const credentials: Record<string, string> = {};
    if (["github", "render", "neon", "notion"].includes(selected.id)) credentials.token = token;
    if (["coingecko", "chartgpt"].includes(selected.id)) credentials.apiKey = apiKey;
    if (selected.id === "paystack") {
      credentials.secretKey = apiKey;
      if (publicKey.trim()) credentials.publicKey = publicKey.trim();
    }
    if (["notes-ai", "custom"].includes(selected.id)) {
      credentials.baseUrl = baseUrl;
      credentials.apiKey = apiKey;
      credentials.modelId = modelId;
    }
    try {
      const response = await fetch("/api/admin/service-connectors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect", serviceId: selected.id, environment,
          displayName, credentials,
        }),
      });
      const result = await response.json() as { connection?: Connection; message?: string };
      if (!response.ok || !result.connection) throw new Error(result.message || "Service connection failed.");
      setConnections((current) => [...current.filter((item) => item.id !== result.connection!.id), result.connection!]);
      setToken(""); setApiKey(""); setPublicKey("");
      setNotice(`${selected.name} passed its live connection test and was saved securely.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service connection failed.");
    } finally { setSaving(false); }
  }

  async function testEnvironment() {
    if (!selected || busyId) return;
    setBusyId("environment");
    setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/service-connectors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-environment", serviceId: selected.id, environment }),
      });
      const result = await response.json() as { message?: string; source?: string };
      if (!response.ok) throw new Error(result.message || "Environment credential test failed.");
      setNotice(`${selected.name} credential from Render environment passed its live connection test.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Environment credential test failed.");
    } finally { setBusyId(""); }
  }

  async function testSaved(connection: Connection) {
    if (busyId) return;
    setBusyId(connection.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/service-connectors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", id: connection.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Connection test failed.");
      setNotice(`${connection.serviceName} connection passed.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection test failed.");
    } finally { setBusyId(""); }
  }

  async function togglePaymentMode(mode: PaymentMode) {
    if (paymentModeBusy) return;
    const enabled = !mode.enabled;
    if (enabled && mode.environment === "live" && !window.confirm("Enable REAL Paystack payments? Customers can make payments that move real money through your activated merchant account.")) return;
    if (!enabled && mode.environment === "live" && !window.confirm("Disable Live payments? New Live checkouts will stop; existing paid subscriptions remain unchanged.")) return;
    setPaymentModeBusy(mode.environment); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/payments/environment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: mode.environment, enabled }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Payment environment could not be updated.");
      setNotice(mode.environment.toUpperCase() + (enabled ? " payments enabled." : " payments disabled."));
      const refreshed = await fetch("/api/admin/payments/environment", { cache: "no-store" });
      const data = await refreshed.json() as { modes?: PaymentMode[] };
      if (refreshed.ok) setPaymentModes(data.modes ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment environment update failed.");
    } finally { setPaymentModeBusy(""); }
  }

  async function disconnect(connection: Connection) {
    if (busyId || !window.confirm(`Disconnect ${connection.displayName}? This removes only the encrypted credential saved in BALMZ AI, not the original key in the provider dashboard or Render.`)) return;
    setBusyId(connection.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/service-connectors", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      if (!response.ok) throw new Error("The saved service connection could not be removed.");
      setConnections((current) => current.filter((item) => item.id !== connection.id));
      setNotice("Saved connection removed. The provider's original API key was not revoked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Disconnect failed.");
    } finally { setBusyId(""); }
  }

  async function loadGitHubRepositories() {
    setReposLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/service-connectors/github/repositories", { cache: "no-store" });
      const result = await response.json() as { repositories?: Repository[]; message?: string };
      if (!response.ok) throw new Error(result.message || "GitHub repositories could not be loaded.");
      setRepos(result.repositories ?? []);
      setNotice(`Loaded ${result.repositories?.length ?? 0} repositories from the connected GitHub account.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GitHub repository load failed.");
    } finally { setReposLoading(false); }
  }

  async function searchAgentDirectory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (agentQuery.trim().length < 2 || agentBusy) return;
    setAgentBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/service-connectors/agentic/search?q=${encodeURIComponent(agentQuery.trim())}`, { cache: "no-store" });
      const result = await response.json() as { results?: typeof agentResults; message?: string; attribution?: string };
      if (!response.ok) throw new Error(result.message || "Agent directory search failed.");
      setAgentResults(result.results ?? []);
      setNotice(`Found ${result.results?.length ?? 0} agent directory matches. ${result.attribution ?? ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent directory search failed.");
    } finally { setAgentBusy(false); }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">Service connector hub</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Connect the services that power your work.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Find a provider, use an existing Render environment secret or save a key in the encrypted connector vault, then run a real read-only connection test. Credentials are never returned to the browser.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Saved connections</p><p className="mt-1 text-2xl font-semibold tabular-nums text-white">{connections.length}</p><p className="mt-1 text-[10px] text-slate-500">External service entries</p></div>
        </div>
      </section>
      {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
          <div className="border-b border-white/[0.07] p-4"><h3 className="text-sm font-semibold text-white">Connector catalogue</h3><label className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5"><span className="text-slate-500">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services…" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></label></div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {filtered.map((service) => <button key={service.id} type="button" onClick={() => { setSelectedId(service.id); setEnvironment(service.demoLive ? "demo" : "live"); setError(""); }} aria-current={selectedId === service.id ? "true" : undefined} className={`mb-1 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedId === service.id ? "border-[var(--balmz-orange)]/35 bg-[var(--balmz-orange)]/[0.075]" : "border-transparent hover:border-white/10 hover:bg-white/[0.035]"}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[10px] font-bold text-[var(--balmz-orange)]">{serviceLogos[service.id]}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{service.name}</span><span className="mt-1 block text-[10px] text-slate-500">{service.category}</span></span>
              {connections.some((entry) => entry.serviceId === service.id && entry.status === "connected") ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : null}
            </button>)}
            {!filtered.length ? <p className="px-4 py-7 text-center text-xs text-slate-500">No matching services.</p> : null}
          </div>
          <div className="border-t border-white/[0.07] px-4 py-3 text-[10px] leading-5 text-slate-600">The catalogue can grow without changing the connector navigation.</div>
        </aside>

        {selected ? <section className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.08] text-xs font-bold text-[var(--balmz-orange)]">{serviceLogos[selected.id]}</span><div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-slate-500">{selected.category}</p><h3 className="mt-1 text-lg font-semibold text-white">{selected.name}</h3></div></div>{selected.url ? <a href={selected.url} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-[var(--balmz-orange)] hover:underline">Provider dashboard ↗</a> : null}</div>
            <p className="mt-4 text-xs leading-6 text-slate-400">{selected.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">{selected.capabilities.map((capability) => <span key={capability} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] text-slate-400">{capability}</span>)}</div>
          </div>

          {selected.demoLive ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0d1420]/80 p-3"><div><p className="text-xs font-semibold text-white">Connection environment</p><p className="mt-1 text-[10px] text-slate-500">Demo and Live credentials are isolated.</p></div><div className="flex rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" onClick={() => setEnvironment("demo")} className={`rounded-lg px-4 py-2 text-[10px] font-semibold ${environment === "demo" ? "bg-amber-300 text-[#17100a]" : "text-slate-400"}`}>Demo</button><button type="button" onClick={() => setEnvironment("live")} className={`rounded-lg px-4 py-2 text-[10px] font-semibold ${environment === "live" ? "bg-emerald-300 text-[#07130b]" : "text-slate-400"}`}>Live</button></div></div> : <div className="rounded-xl border border-white/[0.08] bg-[#0d1420]/80 px-4 py-3 text-xs text-slate-300">Environment: Production / live account</div>}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
              <div className="border-b border-white/[0.07] px-5 py-4"><h4 className="text-sm font-semibold text-white">Connect or test credentials</h4><p className="mt-1 text-xs text-slate-500">Use Render secrets or save an encrypted key.</p></div>
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-200">Render environment</p><p className="mt-1 text-[10px] text-slate-500">{selectedEnvironmentStatus?.configured ? "A matching secret is present on the Render service." : "No matching environment variable detected."}</p></div><Status value={selectedEnvironmentStatus?.configured ? "configured" : "not configured"} /></div><button type="button" onClick={() => void testEnvironment()} disabled={busyId === "environment" || !selectedEnvironmentStatus?.configured} className="mt-3 min-h-9 w-full rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-300 hover:border-[var(--balmz-orange)]/40 disabled:opacity-40">{busyId === "environment" ? "Testing Render secret…" : "Test Render environment key"}</button></div>
                <div className="relative flex items-center gap-3"><div className="h-px flex-1 bg-white/[0.08]" /><span className="text-[9px] uppercase tracking-wider text-slate-600">or add a connector secret</span><div className="h-px flex-1 bg-white/[0.08]" /></div>
                <form onSubmit={connect} className="space-y-3">
                  <label className="block"><span className="text-[10px] text-slate-400">Connection label</span><input required minLength={2} maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label>
                  {["github", "render", "neon", "notion"].includes(selected.id) ? <label className="block"><span className="text-[10px] text-slate-400">Personal / service API token</span><input type="password" autoComplete="new-password" required minLength={10} value={token} onChange={(event) => setToken(event.target.value)} placeholder="Paste API token" className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label> : null}
                  {["paystack", "coingecko", "chartgpt"].includes(selected.id) ? <label className="block"><span className="text-[10px] text-slate-400">{selected.id === "paystack" ? "Paystack secret key" : selected.id === "chartgpt" ? "ChartGPT API key" : "CoinGecko API key"}</span><input type="password" autoComplete="new-password" required minLength={10} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={selected.id === "paystack" ? (environment === "demo" ? "sk_test_…" : "sk_live_…") : "API key"} className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label> : null}
                  {selected.id === "paystack" ? <label className="block"><span className="text-[10px] text-slate-400">Paystack public key (optional)</span><input type="password" autoComplete="new-password" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder={environment === "demo" ? "pk_test_…" : "pk_live_…"} className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label> : null}
                  {["notes-ai", "custom"].includes(selected.id) ? <><label className="block"><span className="text-[10px] text-slate-400">Public HTTPS API base URL</span><input type="url" required value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.vendor.com/v1" className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label><label className="block"><span className="text-[10px] text-slate-400">Model ID</span><input required value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="provider-model-id" className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label><label className="block"><span className="text-[10px] text-slate-400">API key</span><input type="password" autoComplete="new-password" required minLength={10} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Provider API key" className="mt-1.5 min-h-10 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label></> : null}
                  {selected.id === "agentic-ai" ? <p className="rounded-xl border border-sky-400/15 bg-sky-400/[0.04] p-3 text-[10px] leading-5 text-sky-100">No API key is required. Connect & test will contact the public Agentic.ai directory directly.</p> : null}
                  <p className="text-[10px] leading-5 text-slate-500">{selected.keyHelp}</p>
                  <button type="submit" disabled={saving || (!selected.keyRequired && selected.id !== "agentic-ai")} className="min-h-10 w-full rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] hover:brightness-110 disabled:opacity-40">{saving ? "Testing and saving…" : "Connect & test"}</button>
                </form>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
              <div className="border-b border-white/[0.07] px-5 py-4"><h4 className="text-sm font-semibold text-white">Saved connections</h4><p className="mt-1 text-xs text-slate-500">{environment.toUpperCase()} connections for {selected.name}</p></div>
              {loading ? <p className="p-6 text-xs text-slate-500">Loading…</p> : visibleConnections.length ? <div className="divide-y divide-white/[0.055]">{visibleConnections.map((connection) => <article key={connection.id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold text-white">{connection.displayName}</p><p className="mt-1 text-[10px] text-slate-500">Last tested: {date(connection.lastTestedAt)}</p></div><Status value={connection.status} /></div><div className="flex gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => void testSaved(connection)} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-300 disabled:opacity-40">{busyId === connection.id ? "Testing…" : "Test again"}</button><button type="button" disabled={Boolean(busyId)} onClick={() => void disconnect(connection)} className="min-h-9 rounded-lg border border-rose-400/15 px-3 text-[10px] font-semibold text-rose-300 disabled:opacity-40">Disconnect</button></div></article>)}</div> : <div className="p-7 text-center"><p className="text-xs font-medium text-slate-300">No saved {environment} connection</p><p className="mt-2 text-[10px] text-slate-500">Test an existing Render variable or add a connector key.</p></div>}
              {selected.id === "paystack" ? <div className="border-t border-white/[0.06] p-4">
                <h4 className="text-xs font-semibold text-white">Payment activation</h4>
                <p className="mt-1 text-[10px] leading-5 text-slate-500">Connecting a key is not the same as enabling payments. Each mode must be verified and explicitly activated. Live charges require an active Paystack merchant account and a webhook signing secret.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(["demo", "live"] as const).map((environment) => {
                    const mode = paymentModes.find((item) => item.environment === environment);
                    const connected = mode?.credential?.status === "connected";
                    return <article key={environment} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-white">{environment === "live" ? "Live · real money" : "Demo · test only"}</p><Status value={mode?.enabled ? "enabled" : "disabled"} /></div>
                      <p className="mt-2 text-[10px] text-slate-500">Credential: {connected ? "Connected and tested" : "Not verified"}</p>
                      <p className="mt-1 text-[10px] text-slate-600">Last test: {date(mode?.credential?.last_tested_at ?? null)}</p>
                      <button type="button" onClick={() => mode && void togglePaymentMode(mode)} disabled={!mode || !connected || Boolean(paymentModeBusy)} className="mt-3 min-h-9 w-full rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-200 hover:border-[var(--balmz-orange)]/40 disabled:cursor-not-allowed disabled:opacity-40">{paymentModeBusy === environment ? "Updating…" : mode?.enabled ? "Disable payments" : environment === "live" ? "Enable Live payments" : "Enable Demo payments"}</button>
                    </article>;
                  })}
                </div>
              </div> : null}
              {selected.id === "github" ? <div className="border-t border-white/[0.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-white">GitHub repositories</p><p className="mt-1 text-[10px] text-slate-500">Browse repositories accessible to the connected token.</p></div><button type="button" onClick={() => void loadGitHubRepositories()} disabled={reposLoading} className="min-h-9 rounded-lg bg-[var(--balmz-orange)] px-3 text-[10px] font-semibold text-[#17100a] disabled:opacity-40">{reposLoading ? "Loading…" : "Load repositories"}</button></div>{repos.length ? <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{repos.map((repo) => <a key={repo.id} href={repo.url} target="_blank" rel="noreferrer" className="block rounded-lg border border-white/[0.07] bg-black/20 p-3 hover:border-[var(--balmz-orange)]/30"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-200">{repo.fullName}</span><span className="text-[9px] text-slate-500">{repo.private ? "Private" : "Public"}</span></div><p className="mt-1 text-[10px] text-slate-500">Branch: {repo.defaultBranch} · Updated {date(repo.updatedAt)}</p></a>)}</div> : null}</div> : null}
              {selected.id === "agentic-ai" ? <div className="border-t border-white/[0.06] p-4">
                <h4 className="text-xs font-semibold text-white">Search agent directory</h4>
                <p className="mt-1 text-[10px] text-slate-500">Search available AI agents, tools and MCP servers. No vendor key required.</p>
                <form onSubmit={searchAgentDirectory} className="mt-3 flex gap-2">
                  <input value={agentQuery} onChange={(event) => setAgentQuery(event.target.value)} minLength={2} maxLength={160} placeholder="e.g. coding agent with browser tools" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/40" />
                  <button type="submit" disabled={agentBusy || agentQuery.trim().length < 2} className="rounded-lg bg-[var(--balmz-orange)] px-3 text-[10px] font-semibold text-[#17100a] disabled:opacity-40">{agentBusy ? "Searching…" : "Search"}</button>
                </form>
                {agentResults.length ? <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
                  {agentResults.map((item, index) => <article key={item.url || item.name + index} className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-200">{item.name}</p>{item.category ? <span className="text-[9px] text-slate-500">{item.category}</span> : null}</div>
                    <p className="mt-1 text-[10px] leading-5 text-slate-400">{item.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-slate-500"><span>MCP: {item.mcpSupport === null ? "Unknown" : item.mcpSupport ? "Yes" : "No"}</span><span>Open source: {item.openSource === null ? "Unknown" : item.openSource ? "Yes" : "No"}</span></div>
                    {item.url ? <a className="mt-2 inline-block text-[10px] font-semibold text-[var(--balmz-orange)] hover:underline" href={item.url} target="_blank" rel="noreferrer">Open listing ↗</a> : null}
                  </article>)}
                </div> : null}
                <p className="mt-3 text-[9px] leading-5 text-slate-600">Data from Agentic.ai Directory · public API rate limit: 100 requests/hour per IP.</p>
              </div> : null}
            </section>
          </div>
        </section> : null}
      </div>
    </div>
  );
}
