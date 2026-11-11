"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type ChartRow = Record<string, string | number | boolean | null>;
type ChartResult = { requestId: string; spec: unknown; file: string | null; format: "svg" | "png" | "json" };

const exampleData = [
  { quarter: "Q1", revenue: 42 },
  { quarter: "Q2", revenue: 51 },
  { quarter: "Q3", revenue: 47 },
  { quarter: "Q4", revenue: 68 },
];

export function ChartGPTWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("Create a bar chart of quarterly revenue, with a clear title and readable labels.");
  const [dataText, setDataText] = useState(JSON.stringify(exampleData, null, 2));
  const [format, setFormat] = useState<"svg" | "png" | "json">("svg");
  const [result, setResult] = useState<ChartResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function generate() {
    if (busy || !prompt.trim()) return;
    setBusy(true); setError(""); setNotice(""); setResult(null);
    let data: ChartRow[] | undefined;
    if (dataText.trim()) {
      try {
        const parsed: unknown = JSON.parse(dataText);
        if (!Array.isArray(parsed) || !parsed.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
          throw new Error("Data must be a JSON array of objects.");
        }
        data = parsed as ChartRow[];
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Chart data is not valid JSON.");
        setBusy(false);
        return;
      }
    }
    try {
      const response = await fetch("/api/chartgpt/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ...(data ? { data } : {}), format }),
      });
      const payload = await response.json() as ChartResult & { message?: string; error?: string };
      if (!response.ok || !payload.requestId || !payload.spec) {
        throw new Error(payload.message || payload.error || "ChartGPT could not generate a chart.");
      }
      setResult(payload);
      setNotice("Chart generated successfully. Export it before leaving this page; ChartGPT does not keep a chart history.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chart generation failed.");
    } finally { setBusy(false); }
  }

  async function downloadFile() {
    if (!result?.file) return;
    const mime = result.format === "png" ? "image/png" : result.format === "svg" ? "image/svg+xml" : "application/json";
    const blob = new Blob([result.file], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `balmz-chart-${result.requestId}.${result.format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-[100dvh] bg-[#080c14] text-slate-100">
      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-3"><Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={38} height={38} priority className="h-[38px] w-[38px] shrink-0 rounded-xl object-contain" /><div><p className="text-sm font-semibold text-white">ChartGPT workspace</p><p className="mt-0.5 text-[10px] text-slate-500">Generate charts from your own data and prompts</p></div></div>
        <div className="flex shrink-0 items-center gap-2">{isAdmin ? <Link href="/admin?section=service-connectors" className="hidden min-h-10 items-center rounded-xl border border-[var(--balmz-orange)]/30 px-3 py-2 text-xs font-semibold text-[var(--balmz-orange)] transition hover:bg-[var(--balmz-orange)]/10 sm:inline-flex">Manage connectors</Link> : <Link href="/dashboard/plugins" className="hidden min-h-10 items-center rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-[var(--balmz-orange)]/40 sm:inline-flex">Plugins</Link>}<button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push("/dashboard"); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-[var(--balmz-orange)]/40 hover:text-white"><span aria-hidden="true">←</span> Back</button></div>
      </header>
      <div className="mx-auto grid max-w-[1440px] gap-5 px-4 py-5 sm:px-7 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)] lg:py-8">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#111b2b] to-[#0b111c] p-5">
            <span className="inline-flex rounded-full border border-[var(--balmz-orange)]/25 bg-[var(--balmz-orange)]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--balmz-orange)]">Chart generation</span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Turn your data into a chart.</h1>
            <p className="mt-2 text-xs leading-6 text-slate-400">Describe the chart, paste structured data, and choose an export format. BALMZ AI sends the request to ChartGPT from the server; your API key never reaches the browser.</p>
          </div>
          {notice ? <div role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs text-emerald-200">{notice}</div> : null}
          {error ? <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}
          <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-5">
            <label className="block"><span className="text-[11px] font-medium text-slate-300">Chart prompt</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} maxLength={10000} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d15] p-3 text-xs leading-6 text-white outline-none focus:border-[var(--balmz-orange)]/40" /></label>
            <label className="mt-4 block"><span className="text-[11px] font-medium text-slate-300">Data (JSON array of objects)</span><textarea value={dataText} onChange={(event) => setDataText(event.target.value)} rows={12} spellCheck={false} className="mt-2 w-full rounded-xl border border-white/10 bg-[#080d15] p-3 font-mono text-[10px] leading-5 text-slate-200 outline-none focus:border-[var(--balmz-orange)]/40" /></label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-[10px] text-slate-400">Output format<select value={format} onChange={(event) => setFormat(event.target.value as "svg" | "png" | "json")} className="rounded-lg border border-white/10 bg-[#080d15] px-3 py-2 text-xs text-white"><option value="svg">SVG</option><option value="png">PNG</option><option value="json">JSON</option></select></label><button type="button" onClick={() => void generate()} disabled={busy || !prompt.trim()} className="min-h-10 rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-semibold text-[#17100a] disabled:opacity-40">{busy ? "Generating…" : "Generate chart"}</button></div>
          </section>
          <p className="px-1 text-[10px] leading-5 text-slate-600">ChartGPT API access is shown as a Team-plan feature in its documentation. Requests may be billed by ChartGPT and also use one BALMZ AI ai_messages allowance. ChartGPT does not retain chart history, so export results you need to keep.</p>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-white">Chart preview</h2><p className="mt-1 text-[10px] text-slate-500">{result ? `Request ${result.requestId}` : "Your generated chart will appear here."}</p></div>{result?.file ? <button type="button" onClick={() => void downloadFile()} className="rounded-lg border border-[var(--balmz-orange)]/30 px-3 py-2 text-[10px] font-semibold text-[var(--balmz-orange)]">Download {result.format.toUpperCase()}</button> : null}</div>
            {result ? <div className="space-y-4 p-4 sm:p-6">
              {result.format === "svg" && result.file ? <iframe title="Generated chart preview" sandbox="" srcDoc={result.file} className="h-[520px] w-full rounded-xl border border-white/[0.07] bg-white" /> : null}
              {result.format === "png" && result.file ? <img alt="ChartGPT generated chart" src={`data:image/png;base64,${result.file.replace(/^data:image\/png;base64,/, "")}`} className="mx-auto max-h-[600px] max-w-full rounded-xl bg-white object-contain" /> : null}
              {result.format === "json" ? <pre className="max-h-[620px] overflow-auto rounded-xl bg-black/25 p-4 text-[10px] leading-5 text-slate-300">{JSON.stringify(result.spec, null, 2)}</pre> : null}
              <details className="rounded-xl border border-white/[0.07] bg-black/20 p-4"><summary className="cursor-pointer text-[10px] font-semibold text-slate-300">View chart specification</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-slate-500">{JSON.stringify(result.spec, null, 2)}</pre></details>
            </div> : <div className="flex min-h-[420px] flex-col items-center justify-center px-6 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.06] text-2xl text-[var(--balmz-orange)]">▥</span><p className="mt-4 text-sm font-semibold text-slate-300">No chart generated yet</p><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">Add a prompt and your real data, then generate your first chart.</p></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
