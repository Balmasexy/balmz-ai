"use client";

import { useCallback, useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  type: string;
  branch?: string;
  repo?: string;
  serviceDetails?: { url?: string };
  latestDeploy?: { id: string; status: string; commitId: string | null; commitMessage: string | null; updatedAt: string | null } | null;
};
type Payload = { configured: boolean; services: Service[]; message?: string };

function statusTone(status?: string) {
  if (!status) return "border-white/10 bg-white/5 text-slate-400";
  if (["live", "succeeded", "success"].includes(status.toLowerCase())) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (["failed", "canceled", "cancelled"].includes(status.toLowerCase())) return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

export function DeploymentWorkplace() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [clearCache, setClearCache] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/deployments/render", { cache: "no-store" });
      const data = await response.json() as Payload & { message?: string };
      if (!response.ok) throw new Error(data.message || "Could not load Render services.");
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load deployment information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function deploy(service: Service) {
    if (busyId) return;
    const confirmed = window.confirm(`Start a new Render build and deployment for “${service.name}” from its connected branch?${clearCache ? " This will also clear its build cache." : ""}`);
    if (!confirmed) return;
    setBusyId(service.id);
    setNotice("");
    try {
      const response = await fetch("/api/deployments/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: service.id, clearCache }),
      });
      const result = await response.json() as { message?: string; deploy?: { id?: string; status?: string } };
      if (!response.ok) throw new Error(result.message || "Render could not start the deployment.");
      setNotice(`Deployment queued for ${service.name}. Refresh in a moment to see its status.`);
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Deployment could not be started.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#080c14] text-slate-100">
      <header className="flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] px-4 sm:px-8">
        <div><p className="text-sm font-semibold text-white">Deployment workplace</p><p className="mt-0.5 text-[10px] text-slate-500">Build, ship and monitor your connected projects</p></div>
        <button onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:border-[var(--balmz-orange)]/50 disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">Deploy center</span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Take your projects live.</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">Connect your repository to Render, inspect the latest build, and trigger deployments without leaving BALMZ AI. Deployment actions are restricted to your authenticated Super Admin account.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Provider</p><p className="mt-1 text-sm font-semibold text-white">Render</p><p className="mt-1 text-[10px] text-slate-500">Git-connected services</p></div>
          </div>
        </section>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs text-slate-500">Connected services</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{payload?.services.length ?? "—"}</p></div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs text-slate-500">Successful latest builds</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{payload?.services.filter((s) => ["live", "succeeded", "success"].includes(s.latestDeploy?.status?.toLowerCase() ?? "")).length ?? "—"}</p></div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs text-slate-500">Deployment provider</p><p className="mt-2 text-2xl font-semibold text-white">Render</p></div>
        </div>

        {notice ? <div role="status" className="mt-5 rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.07] px-4 py-3 text-xs leading-5 text-slate-200">{notice}</div> : null}
        {error ? <div role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-200">{error}</div> : null}

        {!loading && payload && !payload.configured ? <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-amber-100">Connect Render securely</h2>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-300">{payload.message}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-400">
            <li>Open Render Dashboard → Account Settings → API Keys and create a key with the minimum permissions available.</li>
            <li>Open the BALMZ AI web service → Environment and add <code className="rounded bg-black/30 px-1.5 py-1 text-amber-100">RENDER_API_KEY</code>.</li>
            <li>Save the secret and allow Render to restart the app, then return here and refresh.</li>
          </ol>
          <p className="mt-4 text-[10px] text-slate-500">Never enter API keys into this page, chat messages, or source code. The key is read only by the server.</p>
        </section> : null}

        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold text-white">Your Render projects</h2><p className="mt-1 text-xs text-slate-500">Connected services and their most recent deployment</p></div>
            <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={clearCache} onChange={(event) => setClearCache(event.target.checked)} className="accent-[var(--balmz-orange)]" /> Clear build cache on deploy</label>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? <div className="rounded-2xl border border-white/[0.08] p-8 text-center text-xs text-slate-500">Loading connected projects…</div>
              : payload?.configured && !payload.services.length ? <div className="rounded-2xl border border-white/[0.08] p-8 text-center"><p className="text-sm text-slate-300">No Render services found for this API key.</p><p className="mt-2 text-xs text-slate-500">Check the key's workspace access or connect a project in Render first.</p></div>
              : payload?.services.map((service) => <article key={service.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-white">{service.name}</h3><span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">{service.type.replaceAll("_", " ")}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wider ${statusTone(service.latestDeploy?.status)}`}>{service.latestDeploy?.status ?? "No deploy data"}</span></div>
                    <p className="mt-2 truncate text-xs text-slate-500">{service.repo || "Repository not reported"}{service.branch ? ` · branch ${service.branch}` : ""}</p>
                    {service.latestDeploy?.commitMessage ? <p className="mt-2 line-clamp-2 text-xs text-slate-400">{service.latestDeploy.commitMessage}</p> : null}
                    {service.latestDeploy?.updatedAt ? <p className="mt-2 text-[10px] text-slate-600">Last update: {new Date(service.latestDeploy.updatedAt).toLocaleString()}</p> : null}
                    {service.serviceDetails?.url ? <a href={service.serviceDetails.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] font-medium text-[var(--balmz-orange)] hover:underline">Open live service ↗</a> : null}
                  </div>
                  <button onClick={() => void deploy(service)} disabled={Boolean(busyId)} className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{busyId === service.id ? "Starting…" : "Deploy latest"}</button>
                </div>
              </article>) : null}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-white">Deployment safety</h2>
          <ul className="mt-3 grid gap-2 text-xs leading-5 text-slate-400 sm:grid-cols-2">
            <li>• Only services returned by your connected Render account can be deployed.</li>
            <li>• Deployment requires an authenticated Super Admin session.</li>
            <li>• Deploy starts a real provider build; it may consume paid plan resources or build minutes.</li>
            <li>• No cache clearing happens unless you explicitly select it before deployment.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
