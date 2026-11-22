"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

type Service = { id: string; name: string; repo?: string };
type Project = { slug: string; label: string; services: string[] };
type StoredObject = { key: string; size: number; lastModified: string | null };
type StoragePayload = { configured: boolean; bucket?: string; objects: StoredObject[]; listedBytes: number; truncated: boolean; message?: string };

function slugify(value: string) {
  return value.toLowerCase().replace(/\.git$/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function projectFor(service: Service) {
  const repo = service.repo?.replace(/\.git$/, "").split("/").filter(Boolean).at(-1);
  const label = repo || service.name;
  return { slug: slugify(label) || slugify(service.name) || "unassigned", label };
}
function bytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}
function date(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export function WorkspaceStorage() {
  const [payload, setPayload] = useState<StoragePayload | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [storageResponse, renderResponse] = await Promise.all([
        fetch("/api/deployments/storage", { cache: "no-store" }),
        fetch("/api/deployments/render", { cache: "no-store" }),
      ]);
      const storage = await storageResponse.json() as StoragePayload;
      const render = await renderResponse.json() as { services?: Service[]; message?: string };
      if (!storageResponse.ok) throw new Error(storage.message || "Shared storage could not be loaded.");
      if (!storage.configured) { setPayload(storage); setProjects([]); return; }
      if (!renderResponse.ok) throw new Error(render.message || "Render projects could not be loaded.");
      const map = new Map<string, Project>();
      for (const service of render.services ?? []) {
        const identity = projectFor(service);
        const existing = map.get(identity.slug);
        if (existing) existing.services.push(service.name);
        else map.set(identity.slug, { ...identity, services: [service.name] });
      }
      const nextProjects = [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
      setProjects(nextProjects);
      setSelectedProject((current) => current && nextProjects.some((item) => item.slug === current) ? current : nextProjects[0]?.slug ?? "");
      setPayload(storage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shared storage is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const projectObjects = useMemo(
    () => (payload?.objects ?? []).filter((item) => item.key.startsWith(`projects/${selectedProject}/`)).sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? "")),
    [payload?.objects, selectedProject],
  );
  const projectBytes = projectObjects.reduce((total, item) => total + item.size, 0);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || !selectedProject || uploading) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/deployments/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "upload-url", project: selectedProject, fileName: file.name, contentType: file.type || "application/octet-stream" }) });
      const signed = await response.json() as { url?: string; key?: string; headers?: Record<string, string>; message?: string };
      if (!response.ok || !signed.url || !signed.key) throw new Error(signed.message || "Could not prepare a secure upload.");
      const result = await fetch(signed.url, { method: "PUT", headers: signed.headers ?? { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!result.ok) throw new Error("Upload failed. Check the R2 bucket CORS policy allows PUT from https://balmz-ai.onrender.com with the Content-Type header.");
      setNotice(`Uploaded ${file.name} to ${selectedProject}.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
    finally { setUploading(false); }
  }

  async function download(item: StoredObject) {
    setBusyKey(item.key); setError("");
    try {
      const response = await fetch("/api/deployments/storage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "download-url", key: item.key }) });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok || !result.url) throw new Error(result.message || "Download link could not be created.");
      window.location.assign(result.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Download failed."); }
    finally { setBusyKey(""); }
  }

  async function remove(item: StoredObject) {
    if (busyKey || !window.confirm(`Permanently delete ${item.key} from the shared R2 bucket?`)) return;
    setBusyKey(item.key); setError(""); setNotice("");
    try {
      const response = await fetch("/api/deployments/storage", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: item.key }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "File could not be deleted.");
      setNotice("Project file deleted.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Delete failed."); }
    finally { setBusyKey(""); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/[0.09] bg-gradient-to-br from-[#172131] to-[#101722] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl"><span className="rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--balmz-orange)]">Workspace infrastructure</span><h2 className="mt-4 text-xl font-semibold text-white sm:text-2xl">Shared Cloudflare R2 storage</h2><p className="mt-2 text-xs leading-6 text-slate-400">One private bucket for projects and services managed by this Deployment Workplace. Files are separated by repository namespace; changing the selected Render service does not change the shared storage connection.</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Provider</p><p className="mt-1 text-sm font-semibold text-white">Cloudflare R2</p><p className="mt-1 text-[10px] text-slate-500">{payload?.configured ? payload.bucket : "Not configured"}</p></div>
        </div>
      </section>
      {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-200">{error}</div> : null}
      {loading && !payload ? <div className="rounded-xl border border-white/10 p-8 text-center text-xs text-slate-500">Loading workspace storage…</div> : null}
      {payload && !payload.configured ? <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-5"><p className="text-sm font-semibold text-amber-100">R2 connection not configured</p><p className="mt-2 text-xs leading-6 text-slate-400">{payload.message || "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME on the BALMZ AI Render service. These credentials are shared server-side by the Deployment Workplace; do not add them to every project."}</p></section> : null}
      {payload?.configured ? <>
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-white/[0.08] bg-[#151b23] p-4"><p className="text-[10px] text-slate-500">Objects listed in projects/</p><p className="mt-2 text-2xl font-semibold text-white">{payload.objects.length.toLocaleString("en-NG")}</p><p className="mt-1 text-[10px] text-slate-600">{payload.truncated ? "First 1,000 objects" : "Returned by R2"}</p></article>
          <article className="rounded-xl border border-white/[0.08] bg-[#151b23] p-4"><p className="text-[10px] text-slate-500">Listed project data</p><p className="mt-2 text-2xl font-semibold text-white">{bytes(payload.listedBytes)}</p><p className="mt-1 text-[10px] text-slate-600">Actual listed object sizes</p></article>
          <article className="rounded-xl border border-white/[0.08] bg-[#151b23] p-4"><p className="text-[10px] text-slate-500">Projects mapped from Render</p><p className="mt-2 text-2xl font-semibold text-white">{projects.length.toLocaleString("en-NG")}</p><p className="mt-1 text-[10px] text-slate-600">Repository-based grouping</p></article>
        </div>
        <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#151b23]/90">
          <div className="border-b border-white/[0.07] px-5 py-4"><h3 className="text-sm font-semibold text-white">Project namespace</h3><p className="mt-1 text-xs text-slate-500">Each repository is assigned a separate projects/&lt;repository&gt;/ prefix.</p></div>
          <div className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <label className="block"><span className="mb-2 block text-[10px] font-semibold text-slate-400">Select project / repository</span><select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/10 bg-[#0b0f14] px-3 text-xs text-white">{projects.map((project) => <option key={project.slug} value={project.slug}>{project.label} · {project.services.length} service(s)</option>)}</select><p className="mt-2 text-[10px] leading-5 text-slate-500">{projects.find((item) => item.slug === selectedProject)?.services.join(" · ") || "No Render service mapping available."}</p></label>
            <div className="rounded-xl border border-white/[0.08] bg-[#0b0f14] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Namespace</p><code className="mt-2 block break-all text-xs text-[var(--balmz-orange)]">projects/{selectedProject || "select-project"}/</code><p className="mt-2 text-[10px] text-slate-500">This prefix isolates this repository's files from other projects.</p></div>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-white/[0.09] bg-[#151b23]/90">
          <div className="border-b border-white/[0.07] px-5 py-4"><h3 className="text-sm font-semibold text-white">Project files</h3><p className="mt-1 text-xs text-slate-500">{projectObjects.length} listed · {bytes(projectBytes)} · {selectedProject}</p></div>
          <form onSubmit={upload} className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center"><input ref={inputRef} type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0b0f14] p-3 text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs" /><button type="submit" disabled={!file || !selectedProject || uploading} className="min-h-11 rounded-lg bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] disabled:opacity-40">{uploading ? "Uploading…" : "Upload to project"}</button></form>
          {projectObjects.length ? <div className="divide-y divide-white/[0.055]">{projectObjects.map((item) => <div key={item.key} className="flex flex-wrap items-center gap-3 px-5 py-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--balmz-orange)]/20 text-[var(--balmz-orange)]">▤</span><div className="min-w-0 flex-1"><p className="break-all text-xs font-medium text-slate-200">{item.key.slice(`projects/${selectedProject}/`.length)}</p><p className="mt-1 text-[10px] text-slate-500">{bytes(item.size)} · {date(item.lastModified)}</p></div><div className="flex gap-2"><button type="button" onClick={() => void download(item)} disabled={Boolean(busyKey)} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-300 disabled:opacity-40">{busyKey === item.key ? "Working…" : "Download"}</button><button type="button" onClick={() => void remove(item)} disabled={Boolean(busyKey)} className="min-h-9 rounded-lg border border-rose-400/15 px-3 text-[10px] font-semibold text-rose-300 disabled:opacity-40">Delete</button></div></div>)}</div> : <div className="px-5 py-10 text-center text-xs text-slate-500">No files are stored in this project's namespace yet.</div>}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] leading-5 text-slate-600">Listing covers projects/ only and is capped at 1,000 objects per refresh. Existing admin/ files remain untouched in the legacy Super Admin archive.</p><button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-10 rounded-lg border border-white/10 px-4 text-xs font-semibold text-slate-300 disabled:opacity-40">{loading ? "Refreshing…" : "Refresh workspace storage"}</button></div>
      </> : null}
    </div>
  );
}
