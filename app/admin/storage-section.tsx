"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StoredObject = { key: string; size: number; lastModified: string | null };
type StoragePayload = {
  configured: boolean;
  provider?: string;
  bucket?: string;
  objects: StoredObject[];
  listedBytes: number;
  truncated: boolean;
  message?: string;
  error?: string;
};

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / Math.pow(1024, index)).toFixed(index > 1 ? 2 : 1)} ${units[index]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
      <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StorageSection() {
  const [payload, setPayload] = useState<StoragePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/storage", { cache: "no-store" });
      const result = await response.json() as StoragePayload;
      if (!response.ok) throw new Error(result.message || "Storage could not be read.");
      setPayload(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Storage service is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const totalFiles = payload?.objects.length ?? 0;
  const recentObjects = useMemo(() => [...(payload?.objects ?? [])].sort((a, b) =>
    (b.lastModified ?? "").localeCompare(a.lastModified ?? ""),
  ), [payload?.objects]);

  async function uploadFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload-url",
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });
      const signed = await response.json() as { url?: string; key?: string; headers?: Record<string, string>; message?: string };
      if (!response.ok || !signed.url || !signed.key) throw new Error(signed.message || "A secure upload URL could not be created.");
      const upload = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers ?? { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!upload.ok) throw new Error("Upload failed. Check the bucket's CORS rule allows PUT from https://balmz-ai.onrender.com and retry.");
      setNotice(`Uploaded ${file.name} successfully.`);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadObject(item: StoredObject) {
    setBusyKey(item.key);
    setError("");
    try {
      const response = await fetch("/api/admin/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download-url", key: item.key }),
      });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok || !result.url) throw new Error(result.message || "A download link could not be created.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download could not be started.");
    } finally {
      setBusyKey("");
    }
  }

  async function deleteObject(item: StoredObject) {
    if (busyKey) return;
    if (!window.confirm(`Permanently delete “${item.key.split("/").at(-1)}” from this storage bucket?`)) return;
    setBusyKey(item.key);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/storage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "The file could not be deleted.");
      setNotice("File deleted.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">Super Admin · Object storage</span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">One place for your project files.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">Store deployment archives, exported logs, documents, and project assets outside Render’s temporary build filesystem. Files are kept in a private Cloudflare R2 bucket and are accessed through short-lived transfer links.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Storage provider</p>
            <p className="mt-1 text-sm font-semibold text-white">Cloudflare R2</p>
            <p className="mt-1 text-[10px] text-slate-500">{payload?.configured ? "Connected bucket" : "Connection setup needed"}</p>
          </div>
        </div>
      </section>

      {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs text-emerald-200">{notice}</div> : null}
      {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}

      {loading && !payload ? <div className="rounded-2xl border border-white/[0.08] p-8 text-center text-xs text-slate-500">Checking storage connection…</div> : null}

      {payload && !payload.configured ? (
        <Panel title="Connect large object storage" subtitle="The existing production Neon project is in a region where its object-storage feature is not available. This setup uses a separate R2 bucket without moving your database.">
          <div className="space-y-4 p-5 sm:p-6">
            <p className="text-xs leading-6 text-slate-400">{payload.message}</p>
            <ol className="list-decimal space-y-3 pl-5 text-xs leading-5 text-slate-300">
              <li>Create a private bucket in Cloudflare Dashboard → Storage & databases → R2.</li>
              <li>Create an R2 API token with Object Read & Write permission, scoped to that bucket only. Keep the secret private.</li>
              <li>Add the four values below to the BALMZ AI Render web service Environment. Never paste secret values into BALMZ AI chat or this page.</li>
            </ol>
            <div className="grid gap-2 sm:grid-cols-2">
              {["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].map((key) => (
                <div key={key} className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
                  <code className="break-all text-[11px] text-slate-200">{key}</code>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(key)} className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:text-white">Copy</button>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-4">
              <p className="text-xs font-semibold text-amber-100">Required bucket CORS rule for browser uploads</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">Allow origin <code className="text-amber-100">https://balmz-ai.onrender.com</code>, method <code className="text-amber-100">PUT</code>, and header <code className="text-amber-100">Content-Type</code>. Keep the bucket private; the app uses temporary signed links.</p>
            </div>
            <a href="https://developers.cloudflare.com/r2/get-started/s3/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] hover:brightness-110">Open R2 setup guide ↗</a>
            <p className="text-[10px] leading-5 text-slate-500">Cloudflare R2 Standard currently includes 10 GB-month of storage, 1 million Class A operations and 10 million Class B operations monthly. Usage beyond included amounts is billed by Cloudflare.</p>
          </div>
        </Panel>
      ) : null}

      {payload?.configured ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4"><p className="text-xs text-slate-500">Bytes in listed files</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{formatBytes(payload.listedBytes)}</p><p className="mt-1 text-[10px] text-slate-600">{payload.truncated ? "Partial listing — more objects exist" : "Sum of objects returned by the bucket"}</p></article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4"><p className="text-xs text-slate-500">Listed files</p><p className="mt-2 text-2xl font-semibold tabular-nums text-white">{totalFiles.toLocaleString("en-NG")}</p><p className="mt-1 text-[10px] text-slate-600">{payload.truncated ? "First 1,000 objects" : "All files under admin/ listed"}</p></article>
            <article className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-4"><p className="text-xs text-slate-500">Private bucket</p><p className="mt-2 text-lg font-semibold text-emerald-300">{payload.bucket}</p><p className="mt-1 text-[10px] text-slate-600">Provider: Cloudflare R2</p></article>
          </div>

          <Panel title="Upload to Super Admin storage" subtitle="Uploads go directly to your private R2 bucket using a one-time, short-lived URL.">
            <form onSubmit={uploadFile} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
              <input ref={fileInput} type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-200" />
              <button type="submit" disabled={!file || uploading} className="min-h-11 rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{uploading ? "Uploading…" : "Upload file"}</button>
            </form>
            {file ? <p className="px-5 pb-4 text-[10px] text-slate-500 sm:px-6">Selected: {file.name} · {formatBytes(file.size)}</p> : null}
          </Panel>

          <Panel title="Stored files" subtitle={`Objects under admin/ in ${payload.bucket}`}>
            {recentObjects.length ? (
              <div className="divide-y divide-white/[0.055]">
                {recentObjects.map((item) => (
                  <div key={item.key} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--balmz-orange)]/15 bg-[var(--balmz-orange)]/[0.06] text-sm text-[var(--balmz-orange)]">▤</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-xs font-medium text-slate-200">{item.key.split("/").slice(-1)[0]}</p>
                      <p className="mt-1 text-[10px] text-slate-500">{formatBytes(item.size)} · {formatDate(item.lastModified)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void downloadObject(item)} disabled={Boolean(busyKey)} className="min-h-9 rounded-lg border border-white/10 px-3 text-[10px] font-semibold text-slate-300 hover:border-[var(--balmz-orange)]/40 disabled:opacity-40">{busyKey === item.key ? "Working…" : "Download"}</button>
                      <button type="button" onClick={() => void deleteObject(item)} disabled={Boolean(busyKey)} className="min-h-9 rounded-lg border border-rose-400/15 px-3 text-[10px] font-semibold text-rose-300 hover:bg-rose-400/[0.06] disabled:opacity-40">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="px-6 py-12 text-center"><p className="text-sm font-medium text-slate-300">No files stored yet</p><p className="mt-2 text-xs text-slate-500">Upload deployment archives, documentation, and other project files to begin.</p></div>}
          </Panel>
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] leading-5 text-slate-600">Storage status comes from the connected provider. No placeholder capacity or file counts are displayed.</p>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-9 rounded-xl border border-white/10 px-3 text-[10px] font-semibold text-slate-300 hover:border-[var(--balmz-orange)]/40 disabled:opacity-40">{loading ? "Refreshing…" : "Refresh storage"}</button>
      </div>
    </div>
  );
}
