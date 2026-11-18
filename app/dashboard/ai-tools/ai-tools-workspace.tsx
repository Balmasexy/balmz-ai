"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
type Capability = { id: string; label: string; available: boolean; reason: string | null };
type Provider = { id: string; provider: "openai" | "google"; label: string; model: string; source: "connection" | "environment"; capabilities: Capability[] };
type ToolResult = { provider: string; model: string; text: string; sources: Array<{ url: string; title: string }>; images?: Array<{ mimeType: string; dataBase64: string }>; functionCalls?: unknown[]; requestId: string };
export function AiToolsWorkspace() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/ai/tools", { cache: "no-store" });
      const payload = await response.json() as { providers?: Provider[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "AI tool providers could not be loaded.");
      const items = payload.providers ?? []; setProviders(items);
      setProviderId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI tool providers could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const activeProvider = useMemo(() => providers.find((item) => item.id === providerId) ?? null, [providers, providerId]);
  useEffect(() => {
    if (!activeProvider) { setSelectedTools([]); return; }
    setSelectedTools(activeProvider.capabilities.filter((item) => item.available).map((item) => item.id).slice(0, 3)); setResult(null);
  }, [activeProvider?.id]);
  function toggleTool(id: string, checked: boolean) { setSelectedTools((current) => checked ? [...current.filter((item) => item !== id), id].slice(0, 6) : current.filter((item) => item !== id)); }
  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!activeProvider || !prompt.trim() || !selectedTools.length || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/ai/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: activeProvider.id, prompt, toolIds: selectedTools }) });
      const payload = await response.json() as ToolResult & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "The tool-enabled request failed.");
      setResult(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The tool-enabled request failed."); }
    finally { setBusy(false); }
  }
  return (
    <main className="min-h-[100dvh] bg-[#080c14] pb-16 text-slate-100">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <Link href="/dashboard/plugins" className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">← Plugins</Link>
        <div className="text-center"><p className="text-sm font-semibold text-white">AI tools</p><p className="text-[10px] text-slate-500">OpenAI Responses · Google Gemini</p></div>
        <Link href="/dashboard/connections" className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Connections</Link>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--balmz-orange)]">Native provider tools</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Give your AI tools to work with.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Choose a tested provider, select the tools supported by that model, and submit a task. Provider API usage may incur additional charges beyond your BALMZ AI message allowance.</p>
        {error ? <div role="alert" className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-200">{error}</div> : null}
        {loading ? <div className="mt-8 h-48 animate-pulse rounded-2xl bg-white/[0.04]" /> : providers.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-6"><h2 className="text-sm font-semibold text-white">No tested OpenAI or Gemini model is available</h2><p className="mt-2 text-xs leading-5 text-slate-400">Super Admin must connect and test an OpenAI or Google Gemini model, or configure a supported server-side model credential in Render.</p><Link href="/admin?section=ai-connections" className="mt-4 inline-flex rounded-xl border border-[var(--balmz-orange)]/30 px-4 py-2.5 text-xs text-[var(--balmz-orange)]">Open AI connections</Link></div>
        ) : (
          <form onSubmit={run} className="mt-8 space-y-5">
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
              <label className="block"><span className="text-[11px] font-medium text-slate-400">AI provider and model</span><select value={providerId} onChange={(event) => setProviderId(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50">{providers.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.provider === "google" ? "Gemini" : "OpenAI Responses"}</option>)}</select></label>
              {activeProvider ? <p className="mt-2 text-[10px] text-slate-500">Model: {activeProvider.model} · Credential: {activeProvider.source === "connection" ? "tested saved connection" : "server environment"}</p> : null}
              <div className="mt-6"><h2 className="text-sm font-semibold text-white">Available tools</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{activeProvider?.capabilities.map((item) => <label key={item.id} className={"flex items-start gap-3 rounded-xl border p-3 " + (item.available ? "border-white/[0.08] bg-white/[0.025]" : "border-white/[0.04] bg-black/10 opacity-60")}><input type="checkbox" disabled={!item.available || busy || (!selectedTools.includes(item.id) && selectedTools.length >= 6)} checked={selectedTools.includes(item.id)} onChange={(event) => toggleTool(item.id, event.target.checked)} className="mt-0.5 accent-orange-500"/><span className="min-w-0"><span className="block text-xs font-medium text-slate-200">{item.label}</span>{item.reason ? <span className="mt-1 block text-[10px] leading-5 text-slate-500">{item.reason}</span> : <span className="mt-1 block text-[10px] text-emerald-300">Available for this model</span>}</span></label>)}</div></div>
            </section>
            <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
              <label className="block"><span className="text-[11px] font-medium text-slate-400">What should the AI do?</span><textarea required minLength={2} maxLength={12000} rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Research a topic, calculate something, review a public URL, or generate an image…" className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d15] p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50"/></label>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-slate-500">{selectedTools.length} tool{selectedTools.length === 1 ? "" : "s"} enabled · billed as one BALMZ AI message</p><button type="submit" disabled={busy || !activeProvider || !prompt.trim() || !selectedTools.length} className="rounded-xl bg-[var(--balmz-orange)] px-5 py-3 text-xs font-semibold text-[#17100a] disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Working with tools…" : "Run with selected tools"}</button></div>
            </section>
          </form>
        )}
        {result ? <section className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">Result</h2><span className="text-[10px] text-slate-500">{result.provider} · {result.model}</span></div>{result.text ? <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">{result.text}</div> : null}{result.images?.map((image, index) => <img key={index} alt="AI-generated result" src={"data:" + image.mimeType + ";base64," + image.dataBase64} className="mt-4 max-h-[520px] w-auto max-w-full rounded-xl border border-white/10"/>)}{result.functionCalls?.length ? <pre className="mt-4 overflow-auto rounded-xl bg-black/30 p-3 text-xs text-amber-100">{JSON.stringify(result.functionCalls, null, 2)}</pre> : null}{result.sources?.length ? <div className="mt-6 border-t border-white/[0.07] pt-4"><h3 className="text-xs font-semibold text-white">Sources</h3><ul className="mt-2 space-y-2">{result.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="break-all text-xs text-sky-300 underline underline-offset-2">{source.title}</a></li>)}</ul></div> : null}<p className="mt-5 text-[9px] text-slate-600">Request ID: {result.requestId}</p></section> : null}
      </div>
    </main>
  );
}