"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { confirmNativeAction, hapticNotice, hapticTap, openNativeBrowser, showNativeToast } from "@/lib/capacitor/native-helpers";

type Deploy = {
  id: string;
  status: string;
  trigger?: string;
  createdAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  commit?: { id?: string; message?: string };
};
type LogEntry = {
  id: string;
  message: string;
  timestamp: string;
  labels: Array<{ name: string; value: string }>;
};
type MetricPoint = { timestamp: string; value: number };
type MetricSeries = { unit?: string; values?: MetricPoint[]; labels?: Array<{ field: string; value: string }> };
type Service = {
  id: string;
  name: string;
  type: string;
  suspended?: string;
  branch?: string;
  repo?: string;
  ownerId?: string;
  plan?: string;
  region?: string;
  runtime?: string;
  disk?: unknown;
  serviceDetails?: {
    url?: string;
    plan?: string;
    region?: string;
    runtime?: string;
    healthCheckPath?: string;
    envSpecificDetails?: { buildCommand?: string; startCommand?: string };
    disk?: unknown;
  };
  latestDeploy?: { id: string; status: string; commitId: string | null; commitMessage: string | null; updatedAt: string | null } | null;
};
type Payload = { configured: boolean; services: Service[]; message?: string };
type View = "overview" | "deploys" | "logs" | "metrics" | "events" | "storage" | "settings" | "billing";
type ServiceEvent = { id: string; type: string; timestamp: string; details?: Record<string, unknown> };
type InspectPayload = {
  view: string;
  deploys?: Deploy[];
  events?: ServiceEvent[];
  logs?: LogEntry[];
  cpu?: MetricSeries[];
  memory?: MetricSeries[];
  instanceCount?: MetricSeries[];
  hasMore?: boolean;
  message?: string;
};
const views: Array<{ id: View; label: string; description: string; icon: string }> = [
  { id: "overview", label: "Overview", description: "Service status and latest activity", icon: "◫" },
  { id: "deploys", label: "Deploys", description: "Build and release history", icon: "⇧" },
  { id: "logs", label: "Logs", description: "Build and runtime output", icon: "≋" },
  { id: "metrics", label: "Metrics", description: "CPU, memory and instance data", icon: "⌁" },
  { id: "events", label: "Events", description: "Server lifecycle and operational events", icon: "◷" },
  { id: "storage", label: "Storage", description: "Persistent and object storage", icon: "▤" },
  { id: "settings", label: "Settings", description: "Runtime and build configuration", icon: "⚙" },
  { id: "billing", label: "Billing", description: "Compute plan and Render payment structure", icon: "₦" },
];

function statusTone(status?: string) {
  const value = (status ?? "").toLowerCase();
  if (["live", "succeeded", "success"].includes(value)) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (["failed", "canceled", "cancelled"].includes(value)) return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}
function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}
function short(value?: string | null) {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 7)}…${value.slice(-4)}` : value;
}
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}
function latestPoint(series?: MetricSeries[]) {
  const points = (series ?? []).flatMap((item) => item.values ?? []).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return points.at(-1);
}
function metricValue(series?: MetricSeries[]) {
  const point = latestPoint(series);
  const unit = series?.[0]?.unit ?? "";
  if (!point) return "No data";
  if (unit.toLowerCase().includes("byte")) return formatBytes(point.value);
  return `${point.value.toLocaleString("en-NG", { maximumFractionDigits: 3 })} ${unit}`.trim();
}
function Sparkline({ series }: { series?: MetricSeries[] }) {
  const points = (series ?? []).flatMap((item) => item.values ?? []).sort((a, b) => a.timestamp.localeCompare(b.timestamp)).slice(-24);
  if (!points.length) return <p className="mt-4 text-[10px] text-slate-600">No metric samples returned for this time range.</p>;
  const maximum = Math.max(...points.map((point) => point.value), 0.000001);
  return (
    <div className="mt-4 flex h-14 items-end gap-1" aria-label="Recent metric samples">
      {points.map((point, index) => <div key={point.timestamp + index} title={`${point.value} · ${date(point.timestamp)}`} className="min-w-0 flex-1 rounded-t-sm bg-[var(--balmz-orange)]/80" style={{ height: `${Math.max(4, (point.value / maximum) * 100)}%` }} />)}
    </div>
  );
}
function Panel({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div><h2 className="text-sm font-semibold text-white">{title}</h2>{subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DeploymentWorkplace() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [clearCache, setClearCache] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [view, setView] = useState<View>("overview");
  const [inspect, setInspect] = useState<InspectPayload | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState("");
  const [logFilter, setLogFilter] = useState("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/deployments/render", { cache: "no-store" });
      const data = await response.json() as Payload & { message?: string };
      if (!response.ok) throw new Error(data.message || "Could not load Render services.");
      setPayload(data);
      setSelectedServiceId((current) => current && data.services.some((service) => service.id === current)
        ? current
        : data.services[0]?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load deployment information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedService = useMemo(
    () => payload?.services.find((service) => service.id === selectedServiceId) ?? null,
    [payload?.services, selectedServiceId],
  );

  const loadInspect = useCallback(async (serviceId: string, selectedView: View) => {
    if (!serviceId || !["deploys", "logs", "metrics", "events"].includes(selectedView)) {
      setInspect(null);
      setInspectError("");
      return;
    }
    setInspectLoading(true);
    setInspectError("");
    try {
      const response = await fetch(`/api/deployments/render/inspect?serviceId=${encodeURIComponent(serviceId)}&view=${selectedView}`, { cache: "no-store" });
      const result = await response.json() as InspectPayload & { error?: string; message?: string };
      if (!response.ok) throw new Error(result.message || "Render could not return this service view.");
      setInspect(result);
    } catch (cause) {
      setInspect(null);
      setInspectError(cause instanceof Error ? cause.message : "Service information could not be loaded.");
    } finally {
      setInspectLoading(false);
    }
  }, []);

  useEffect(() => { void loadInspect(selectedServiceId, view); }, [selectedServiceId, view, loadInspect]);

  async function deploy(service: Service) {
    if (busyId) return;
    const confirmed = await confirmNativeAction("Deploy latest", `Start a Render build and deployment for “${service.name}” from its connected branch?${clearCache ? " This will also clear its build cache." : ""}`);
    if (!confirmed) return;
    setBusyId(service.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/deployments/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, clearCache }),
      });
      const result = await response.json() as { message?: string; deploy?: { id?: string; status?: string } };
      if (!response.ok) throw new Error(result.message || "Render could not start the deployment.");
      setNotice(`Deployment request accepted for ${service.name}. Its status will update after Render processes the build.`);
      void hapticNotice(true);
      setView("deploys");
      await refresh();
      await loadInspect(service.id, "deploys");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Deployment could not be started.");
      void hapticNotice(false);
    } finally {
      setBusyId("");
    }
  }

  async function serverAction(service: Service, action: "restart" | "suspend" | "resume") {
    if (busyId) return;
    const labels = { restart: "Restart server", suspend: "Suspend server", resume: "Resume server" };
    const effects = {
      restart: "This briefly restarts the running service.",
      suspend: "This takes the service offline until it is resumed.",
      resume: "This starts the suspended service again. It may consume compute usage while running.",
    };
    const confirmed = await confirmNativeAction(labels[action], `${service.name}: ${effects[action]} Continue?`);
    if (!confirmed) return;
    setBusyId(service.id);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/deployments/render/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, action }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "Render could not complete this server action.");
      setNotice(result.message || labels[action] + " request accepted by Render.");
      void hapticTap();
      void hapticNotice(true);
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Server action failed.");
      void hapticNotice(false);
    } finally {
      setBusyId("");
    }
  }

  const filteredLogs = useMemo(() => {
    const logs = inspect?.logs ?? [];
    if (logFilter === "errors") return logs.filter((entry) => entry.labels?.some((label) => label.name === "level" && ["error", "critical", "alert", "emergency"].includes(label.value)));
    if (logFilter === "build") return logs.filter((entry) => entry.labels?.some((label) => label.name === "type" && label.value === "build"));
    return logs;
  }, [inspect?.logs, logFilter]);

  const dashboardUrl = selectedService
    ? `https://dashboard.render.com/${selectedService.type === "static_site" ? "static" : "web"}/${selectedService.id}`
    : "https://dashboard.render.com";

  return (
    <main className="min-h-[100dvh] bg-[#080c14] text-slate-100">
      <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <div><p className="text-sm font-semibold text-white">Deployment workplace</p><p className="mt-0.5 text-[10px] text-slate-500">Render-style project controls · protected Super Admin workspace</p></div>
        <div className="flex items-center gap-2">
          {payload?.configured ? <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-[10px] font-semibold text-emerald-200 sm:inline-flex">Render API connected</span> : <span className="hidden rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[10px] font-semibold text-amber-200 sm:inline-flex">{loading ? "Checking Render…" : "Render key not verified"}</span>}
          <button onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:border-[var(--balmz-orange)]/50 disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
          <a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="hidden rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white sm:inline-flex">Open Render ↗</a>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-5 px-3 py-5 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-7">
        <aside className="min-w-0 space-y-3">
          <div className="flex items-center justify-between px-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace</p><h2 className="mt-1 text-sm font-semibold text-white">Projects & services</h2></div><span className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-500">{payload?.services.length ?? "—"}</span></div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible">
            {loading && !payload ? <div className="min-w-64 rounded-xl border border-white/[0.08] p-5 text-xs text-slate-500 lg:min-w-0">Loading services…</div> : null}
            {payload?.services.map((service) => (
              <button key={service.id} type="button" onClick={() => { setSelectedServiceId(service.id); setView("overview"); setInspect(null); setNotice(""); }} aria-current={selectedServiceId === service.id ? "page" : undefined} className={`min-w-64 rounded-xl border p-3 text-left transition lg:min-w-0 lg:w-full ${selectedServiceId === service.id ? "border-[var(--balmz-orange)]/35 bg-[var(--balmz-orange)]/[0.075]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"}`}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold text-slate-100">{service.name}</span><span className={`h-2 w-2 shrink-0 rounded-full ${["live", "succeeded", "success"].includes(service.latestDeploy?.status?.toLowerCase() ?? "") ? "bg-emerald-400" : ["failed", "canceled"].includes(service.latestDeploy?.status?.toLowerCase() ?? "") ? "bg-rose-400" : "bg-amber-300"}`} /></div>
                <p className="mt-1 truncate text-[10px] text-slate-500">{service.repo?.split("/").slice(-1)[0] || service.type.replaceAll("_", " ")}</p>
                <div className="mt-2 flex items-center justify-between gap-2"><span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${statusTone(service.latestDeploy?.status)}`}>{service.latestDeploy?.status ?? "No deploy"}</span><span className="truncate text-[9px] text-slate-600">{service.region ?? service.serviceDetails?.region ?? ""}</span></div>
              </button>
            ))}
          </div>
          {payload?.configured && !payload.services.length ? <div className="rounded-xl border border-white/[0.08] p-4 text-xs text-slate-500">No services are available to this Render API key.</div> : null}
          <div className="hidden rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[10px] leading-5 text-slate-500 lg:block">Choose a service, then use its Overview, Deploys, Logs, Metrics, Storage and Settings pages.</div>
        </aside>

        <section className="min-w-0 space-y-5">
          {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-200">{error}</div> : null}
          {!loading && payload && !payload.configured ? (
            <Panel title="Connect Render securely" subtitle="This workspace uses the Render REST API from the server only.">
              <div className="space-y-4 p-5 sm:p-6">
                <p className="text-xs leading-6 text-slate-400">{payload.message}</p>
                <ol className="list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-400">
                  <li>Open Render Dashboard → Account Settings → API Keys and create a key with the minimum available permissions.</li>
                  <li>Open the BALMZ AI Render web service → Environment and add <code className="text-amber-100">RENDER_API_KEY</code>.</li>
                  <li>Save the secret, allow the service to restart, and refresh this workplace.</li>
                </ol>
                <p className="text-[10px] text-slate-500">Never place API keys in browser storage, chat prompts, or source code.</p>
              </div>
            </Panel>
          ) : null}

          {selectedService ? (
            <>
              <section className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h1 className="break-all text-xl font-semibold tracking-tight text-white">{selectedService.name}</h1><span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${statusTone(selectedService.latestDeploy?.status)}`}>{selectedService.latestDeploy?.status ?? "No deploy data"}</span></div>
                    <p className="mt-2 break-all text-[11px] text-slate-500">{selectedService.repo || "Repository not reported"}{selectedService.branch ? ` · branch ${selectedService.branch}` : ""}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span>{selectedService.type.replaceAll("_", " ")}</span><span>{selectedService.region ?? selectedService.serviceDetails?.region ?? "Region not reported"}</span><span>{selectedService.plan ?? selectedService.serviceDetails?.plan ?? "Plan not reported"}</span><span>{selectedService.runtime ?? selectedService.serviceDetails?.runtime ?? "Runtime not reported"}</span></div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => void openNativeBrowser(dashboardUrl).catch(() => showNativeToast("Could not open this service in Render."))} className="min-h-10 rounded-xl border border-white/10 px-3 py-2.5 text-[10px] font-semibold text-slate-300 hover:border-[var(--balmz-orange)]/40">Open on Render ↗</button>
                    <button onClick={() => void deploy(selectedService)} disabled={Boolean(busyId)} className="min-h-10 rounded-xl bg-[var(--balmz-orange)] px-4 py-2.5 text-[10px] font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{busyId === selectedService.id ? "Starting…" : "Deploy latest"}</button>
                  </div>
                </div>
                {selectedService.serviceDetails?.url ? <a href={selectedService.serviceDetails.url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[10px] font-semibold text-[var(--balmz-orange)] hover:underline">Open live application ↗</a> : null}
              </section>

              <nav aria-label="Selected service sections" className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-[#0a111c] p-1">
                {views.map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} aria-current={view === item.id ? "page" : undefined} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-[10px] font-semibold transition ${view === item.id ? "bg-[var(--balmz-orange)] text-[#17100a]" : "text-slate-400 hover:bg-white/[0.045] hover:text-white"}`}><span>{item.icon}</span>{item.label}</button>)}
              </nav>

              {notice ? <div role="status" className="rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.07] px-4 py-3 text-xs leading-5 text-slate-200">{notice}</div> : null}

              {view === "overview" ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4"><p className="text-xs text-slate-500">Latest deployment</p><p className="mt-2 text-sm font-semibold text-white">{selectedService.latestDeploy?.status ?? "Not available"}</p><p className="mt-1 text-[10px] text-slate-600">{date(selectedService.latestDeploy?.updatedAt)}</p></article>
                    <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4"><p className="text-xs text-slate-500">Connected branch</p><p className="mt-2 truncate text-sm font-semibold text-white">{selectedService.branch ?? "Not reported"}</p><p className="mt-1 text-[10px] text-slate-600">{selectedService.repo ?? "Repository not reported"}</p></article>
                    <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4"><p className="text-xs text-slate-500">Hosting plan</p><p className="mt-2 text-sm font-semibold text-white">{selectedService.plan ?? selectedService.serviceDetails?.plan ?? "Not reported"}</p><p className="mt-1 text-[10px] text-slate-600">Region: {selectedService.region ?? selectedService.serviceDetails?.region ?? "Not reported"}</p></article>
                  </div>
                  <Panel title="Server requests" subtitle="Run approved service actions directly from BALMZ AI">
                    <div className="grid gap-3 p-5 sm:grid-cols-3">
                      <button type="button" disabled={Boolean(busyId) || !["web_service", "private_service", "background_worker"].includes(selectedService.type)} onClick={() => void serverAction(selectedService, "restart")} className="min-h-12 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-200 transition hover:border-[var(--balmz-orange)]/40 disabled:opacity-40">{busyId === selectedService.id ? "Working…" : "↻ Restart service"}</button>
                      {selectedService.suspended === "suspended"
                        ? <button type="button" disabled={Boolean(busyId)} onClick={() => void serverAction(selectedService, "resume")} className="min-h-12 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 text-xs font-semibold text-emerald-200 disabled:opacity-40">▶ Resume service</button>
                        : <button type="button" disabled={Boolean(busyId) || selectedService.suspended === "suspended"} onClick={() => void serverAction(selectedService, "suspend")} className="min-h-12 rounded-xl border border-rose-400/20 px-3 text-xs font-semibold text-rose-200 disabled:opacity-40">Ⅱ Suspend service</button>}
                      <button type="button" onClick={() => setView("events")} className="min-h-12 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-200 hover:border-[var(--balmz-orange)]/40">◷ Service events</button>
                    </div>
                    <p className="px-5 pb-4 text-[10px] leading-5 text-slate-500">Actions require a Super Admin session and a confirmation prompt. Suspending takes the selected service offline. Plan upgrades and paid resource changes are not performed here.</p>
                  </Panel>
                  <Panel title="Latest release" subtitle="Most recently reported deployment from the connected Render service">
                    <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
                      <div className="min-w-0 flex-1"><p className="break-all font-mono text-xs text-slate-300">{selectedService.latestDeploy?.commitId ?? "Commit ID not reported"}</p><p className="mt-2 text-sm text-slate-200">{selectedService.latestDeploy?.commitMessage ?? "No commit message returned by Render."}</p><p className="mt-2 text-[10px] text-slate-500">Updated {date(selectedService.latestDeploy?.updatedAt)}</p></div>
                      <button type="button" onClick={() => setView("deploys")} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-300 hover:text-white">View deploy history</button>
                    </div>
                  </Panel>
                  <Panel title="Quick navigation" subtitle="Select a service area to investigate it">
                    <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
                      {views.filter((item) => item.id !== "overview").map((item) => <button key={item.id} type="button" onClick={() => setView(item.id)} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition hover:border-[var(--balmz-orange)]/30 hover:bg-white/[0.04]"><p className="text-sm font-semibold text-slate-200">{item.icon} {item.label}</p><p className="mt-1 text-[10px] text-slate-500">{item.description}</p></button>)}
                    </div>
                  </Panel>
                </div>
              ) : null}

              {view === "deploys" ? (
                <Panel title="Deploy history" subtitle="Latest 25 builds and releases returned by Render" action={<span className="text-[10px] text-slate-600">{inspect?.deploys?.length ?? 0} records</span>}>
                  {inspectLoading ? <div className="p-8 text-center text-xs text-slate-500">Loading deployment history…</div>
                    : inspectError ? <div role="alert" className="p-6 text-xs text-rose-300">{inspectError}</div>
                    : inspect?.deploys?.length ? <div className="divide-y divide-white/[0.055]">{inspect.deploys.map((deploy) => <div key={deploy.id} className="flex flex-wrap items-start gap-3 px-5 py-4 sm:px-6"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-white/30" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-slate-500">{short(deploy.id)}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${statusTone(deploy.status)}`}>{deploy.status}</span><span className="text-[9px] text-slate-600">{deploy.trigger ?? "trigger not reported"}</span></div><p className="mt-2 text-xs leading-5 text-slate-300">{deploy.commit?.message ?? "No commit message"}</p><p className="mt-1 font-mono text-[9px] text-slate-600">{deploy.commit?.id ?? ""}</p><p className="mt-2 text-[10px] text-slate-500">Started {date(deploy.createdAt)} · Finished {date(deploy.finishedAt)}</p></div></div>)}</div>
                    : <div className="p-8 text-center text-xs text-slate-500">No deploy history returned for this service.</div>}
                </Panel>
              ) : null}

              {view === "logs" ? (
                <Panel title="Service logs" subtitle="Recent build and runtime messages from Render" action={<select aria-label="Filter logs" value={logFilter} onChange={(event) => setLogFilter(event.target.value)} className="rounded-lg border border-white/10 bg-[#080d15] px-2 py-2 text-[10px] text-slate-300"><option value="all">All logs</option><option value="errors">Errors only</option><option value="build">Build logs</option></select>}>
                  {inspectLoading ? <div className="p-8 text-center text-xs text-slate-500">Loading service logs…</div>
                    : inspectError ? <div role="alert" className="p-6 text-xs text-rose-300">{inspectError}</div>
                    : filteredLogs.length ? <div className="max-h-[680px] overflow-auto divide-y divide-white/[0.045]">{filteredLogs.map((entry) => { const type = entry.labels?.find((label) => label.name === "type")?.value ?? "app"; const level = entry.labels?.find((label) => label.name === "level")?.value ?? "info"; return <div key={entry.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[150px_75px_70px_minmax(0,1fr)] sm:items-start sm:px-5"><time className="text-[9px] text-slate-600">{date(entry.timestamp)}</time><span className="text-[9px] uppercase text-slate-500">{type}</span><span className={`text-[9px] uppercase ${["error", "critical", "alert", "emergency"].includes(level) ? "text-rose-300" : "text-slate-500"}`}>{level}</span><p className="break-words whitespace-pre-wrap font-mono text-[10px] leading-5 text-slate-300">{entry.message}</p></div>; })}</div>
                    : <div className="p-8 text-center text-xs text-slate-500">No logs match this filter, or Render has not returned log data yet.</div>}
                </Panel>
              ) : null}

              {view === "events" ? (
                <Panel title="Service events" subtitle="Recent Render lifecycle events for this service">
                  {inspectLoading ? <div className="p-8 text-center text-xs text-slate-500">Loading service events…</div>
                    : inspectError ? <div role="alert" className="p-6 text-xs text-rose-300">{inspectError}</div>
                    : inspect?.events?.length ? <div className="divide-y divide-white/[0.055]">{inspect.events.map((event) => <div key={event.id} className="flex flex-wrap items-start gap-3 px-5 py-4 sm:px-6"><span className="mt-1 text-[var(--balmz-orange)]">◷</span><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-200">{event.type.replaceAll("_", " ")}</p><p className="mt-1 break-all font-mono text-[9px] text-slate-600">{event.id}</p>{event.details ? <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-slate-500">{JSON.stringify(event.details, null, 2)}</pre> : null}</div><time className="text-[10px] text-slate-500">{date(event.timestamp)}</time></div>)}</div>
                    : <div className="p-8 text-center text-xs text-slate-500">No recent events were returned by Render.</div>}
                </Panel>
              ) : null}
              {view === "metrics" ? (
                <div className="space-y-4">
                  {inspectLoading ? <div className="rounded-2xl border border-white/[0.08] p-8 text-center text-xs text-slate-500">Loading service metrics…</div>
                    : inspectError ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] p-5 text-xs text-rose-200">{inspectError}</div>
                    : <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5"><p className="text-xs text-slate-500">CPU usage · latest sample</p><p className="mt-2 text-2xl font-semibold text-white">{metricValue(inspect?.cpu)}</p><Sparkline series={inspect?.cpu} /></article>
                        <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5"><p className="text-xs text-slate-500">Memory usage · latest sample</p><p className="mt-2 text-2xl font-semibold text-white">{metricValue(inspect?.memory)}</p><Sparkline series={inspect?.memory} /></article>
                      </div>
                      <Panel title="Instance metrics" subtitle="Instance count over the most recent hour">
                        <div className="p-5"><p className="text-xl font-semibold text-white">{metricValue(inspect?.instanceCount)}</p><Sparkline series={inspect?.instanceCount} /></div>
                      </Panel>
                      <p className="px-1 text-[10px] leading-5 text-slate-600">Metrics are fetched from Render's API for the last hour. Empty samples mean Render did not return that metric for this resource or plan.</p>
                    </>}
                </div>
              ) : null}

              {view === "billing" ? (
                <div className="space-y-4">
                  <Panel title="Render compute & payment structure" subtitle="The selected service plan is read from the connected Render service record">
                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.055] p-4">
                        <div><p className="text-[10px] uppercase tracking-wider text-emerald-300">Current service compute plan</p><p className="mt-1 text-xl font-semibold text-white">{(selectedService.plan ?? selectedService.serviceDetails?.plan ?? "Not reported").toUpperCase()}</p><p className="mt-1 text-[10px] text-slate-500">Service: {selectedService.name} · {selectedService.type.replaceAll("_", " ")}</p></div>
                        <span className="rounded-full border border-emerald-400/20 px-3 py-1.5 text-[10px] font-semibold text-emerald-200">{(selectedService.plan ?? selectedService.serviceDetails?.plan ?? "").toLowerCase() === "free" ? "₦0 / $0 compute tier" : "Paid compute tier"}</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-white/[0.08] p-4"><p className="text-xs font-semibold text-white">Service compute billing</p><p className="mt-2 text-[11px] leading-5 text-slate-400">Render charges compute per service. Paid compute is prorated by active time; the current BALMZ AI service is on the Free compute tier.</p></div>
                        <div className="rounded-xl border border-white/[0.08] p-4"><p className="text-xs font-semibold text-white">Workspace billing</p><p className="mt-2 text-[11px] leading-5 text-slate-400">Workspace subscription, outbound bandwidth, build pipeline usage and invoices are managed in Render Billing. Those account-level amounts are not returned by this service API response.</p></div>
                      </div>
                      <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-4">
                        <p className="text-xs font-semibold text-amber-100">Free service limits</p>
                        <p className="mt-2 text-[11px] leading-5 text-slate-400">Render Free web services spin down after 15 minutes without inbound traffic; the first request after sleep can take about a minute to wake the service. Free filesystems are ephemeral, so uploaded files must live in Neon, object storage or another persistent store. Free instance hours are shared across the workspace.</p>
                      </div>
                    </div>
                  </Panel>
                  <Panel title="Published compute examples" subtitle="Illustrative Render service compute prices in USD per month; actual selection and bill are confirmed by Render">
                    <div className="divide-y divide-white/[0.055]">
                      {[[ "Free", "$0", "Free tier · reduced resources and sleep/ephemeral storage limits" ], [ "0.1 CPU / 256 MB", "$6", "Small paid compute" ], [ "0.5 CPU / 1 GB", "$19", "Entry standard compute" ], [ "1 CPU / 2 GB", "$40", "Higher memory and CPU" ], [ "1 CPU / 4 GB", "$55", "Higher memory" ]].map(([name, price, detail]) => <div key={name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"><div><p className="text-xs font-semibold text-slate-200">{name}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></div><p className="text-sm font-semibold tabular-nums text-white">{price}<span className="text-[10px] font-normal text-slate-500"> / month</span></p></div>)}
                    </div>
                    <div className="border-t border-white/[0.06] p-5"><p className="text-[10px] leading-5 text-slate-500">Prices are published examples, not a quote or a charge to your account. Bandwidth and build pipeline overages may be billed separately depending on workspace settings and payment method.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void openNativeBrowser("https://render.com/pricing").catch(() => showNativeToast("Could not open Render pricing."))} className="min-h-10 rounded-xl border border-white/10 px-4 text-[10px] font-semibold text-slate-300">View Render pricing ↗</button><button type="button" onClick={() => void openNativeBrowser("https://dashboard.render.com").catch(() => showNativeToast("Could not open Render Dashboard."))} className="min-h-10 rounded-xl bg-[var(--balmz-orange)] px-4 text-[10px] font-semibold text-[#17100a]">Open Render Billing ↗</button></div></div>
                  </Panel>
                  <p className="px-1 text-[10px] leading-5 text-slate-600">BALMZ AI has not upgraded or changed this service plan. No billing method, spend limit, or paid resource was changed by this workplace.</p>
                </div>
              ) : null}
              {view === "storage" ? (
                <div className="space-y-4">
                  <Panel title="Service-attached storage" subtitle="Persistent disks are separate from the Super Admin's shared file archive">
                    <div className="space-y-3 p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">{selectedService.disk || selectedService.serviceDetails?.disk ? "Persistent disk reported" : "No persistent disk reported"}</p><p className="mt-1 text-xs text-slate-500">Service: {selectedService.name}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-slate-400">{selectedService.disk || selectedService.serviceDetails?.disk ? "Provider disk" : "No disk data"}</span></div>
                      <p className="text-xs leading-6 text-slate-400">A Render disk is local to one service instance and is not available during builds. BALMZ AI keeps deployment archives and shared administrator files in the separate private object-storage workspace.</p>
                      <a href="/admin" className="inline-flex min-h-10 items-center rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] hover:brightness-110">Open Super Admin storage ↗</a>
                    </div>
                  </Panel>
                  <Panel title="Storage architecture" subtitle="Choose the storage type that matches the workload">
                    <div className="grid gap-3 p-5 sm:grid-cols-2"><div className="rounded-xl border border-white/[0.07] p-4"><p className="text-xs font-semibold text-white">Render persistent disk</p><p className="mt-2 text-[11px] leading-5 text-slate-500">For files that must live on this one running service. It does not expand build storage or share files across services.</p></div><div className="rounded-xl border border-white/[0.07] p-4"><p className="text-xs font-semibold text-white">Super Admin object storage</p><p className="mt-2 text-[11px] leading-5 text-slate-500">For archives, documents, backups and files that need to be accessed independently of a Render deployment.</p></div></div>
                  </Panel>
                </div>
              ) : null}

              {view === "settings" ? (
                <Panel title="Service configuration" subtitle="Configuration returned by Render; values are shown read-only">
                  <div className="divide-y divide-white/[0.055]">
                    {[
                      ["Service ID", selectedService.id],
                      ["Service type", selectedService.type],
                      ["Repository", selectedService.repo],
                      ["Branch", selectedService.branch],
                      ["Region", selectedService.region ?? selectedService.serviceDetails?.region],
                      ["Plan", selectedService.plan ?? selectedService.serviceDetails?.plan],
                      ["Runtime", selectedService.runtime ?? selectedService.serviceDetails?.runtime],
                      ["Build command", selectedService.serviceDetails?.envSpecificDetails?.buildCommand],
                      ["Start command", selectedService.serviceDetails?.envSpecificDetails?.startCommand],
                      ["Health check", selectedService.serviceDetails?.healthCheckPath],
                      ["Auto deploy", "Managed in Render"],
                    ].map(([label, value]) => <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"><p className="text-[10px] text-slate-500">{label}</p><p className="break-all text-xs text-slate-200">{typeof value === "string" && value ? value : "Not reported"}</p></div>)}
                  </div>
                  <div className="border-t border-white/[0.06] p-5"><button type="button" onClick={() => void openNativeBrowser(dashboardUrl).catch(() => showNativeToast("Could not open Render settings."))} className="text-[10px] font-semibold text-[var(--balmz-orange)] hover:underline">Open editable settings in Render Dashboard ↗</button></div>
                </Panel>
              ) : null}
            </>
          ) : null}

          {!selectedService && payload?.configured && !loading ? <div className="rounded-2xl border border-white/[0.08] p-10 text-center"><p className="text-sm font-semibold text-white">No service selected</p><p className="mt-2 text-xs text-slate-500">Connect a Render API key with access to your projects, then refresh this page.</p></div> : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4 text-[10px] text-slate-600"><p>Super Admin · Server-side Render API · no API secrets in the browser</p><label className="flex items-center gap-2 text-[10px] text-slate-500"><input type="checkbox" checked={clearCache} onChange={(event) => setClearCache(event.target.checked)} className="accent-[var(--balmz-orange)]" /> Clear build cache on next deploy</label></div>
        </section>
      </div>
    </main>
  );
}
