"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { QuickChatHelper } from "@/app/components/quick-chat-helper";

type Variant = { channel: string; headline: string; body: string; callToAction: string };
type CampaignResult = {
  title: string;
  concept: string;
  audienceInsight: string;
  keyMessage: string;
  variants: Variant[];
  launchChecklist: string[];
  imagePrompt: string;
};
type Campaign = {
  id: string;
  requestId: string;
  brief: string;
  audience: string;
  productDetails: string;
  tone: string;
  channels: string[];
  result: CampaignResult;
  createdAt: string;
  imagePrompt: string;
  imageGenerated: boolean;
  imageDataUrl?: string | null;
  imageError?: string | null;
};
type HistoryItem = Omit<Campaign, "imageDataUrl" | "imageError"> & { title?: string };

const channelOptions = ["Instagram", "Facebook", "TikTok", "LinkedIn", "Email", "Website", "X", "WhatsApp"];

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-white/[0.08] bg-[#111a27] p-5 sm:p-6"><h2 className="text-sm font-semibold text-white">{title}</h2><div className="mt-4">{children}</div></section>;
}
function Field({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-slate-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} maxLength={4000} placeholder={placeholder} className="w-full resize-y rounded-xl border border-white/10 bg-[#080f19] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" /></label>;
}

export function CampaignStudioWorkspace() {
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("");
  const [productDetails, setProductDetails] = useState("");
  const [tone, setTone] = useState("Clear, confident and human");
  const [channels, setChannels] = useState<string[]>(["Instagram", "Email", "Website"]);
  const [generateImage, setGenerateImage] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/campaign-studio", { cache: "no-store" });
      const payload = await response.json() as { campaigns?: HistoryItem[]; message?: string };
      if (!response.ok) throw new Error(payload.message || "Campaign history could not be loaded.");
      setHistory(payload.campaigns ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Campaign history is unavailable.");
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { void loadHistory(); }, []);

  function toggleChannel(channel: string) {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel].slice(0, 8));
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setNotice("");
    setCampaign(null);
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch("/api/campaign-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, brief, audience, productDetails, tone, channels, generateImage }),
      });
      const payload = await response.json() as { campaign?: Campaign; message?: string };
      if (!response.ok || !payload.campaign) throw new Error(payload.message || "Campaign generation failed.");
      setCampaign(payload.campaign);
      setNotice(payload.campaign.imageError ? "Campaign copy saved. The image prompt is ready; image generation needs attention." : "Campaign generated and saved to your account.");
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Campaign generation failed.");
    } finally {
      setLoading(false);
    }
  }

  function openHistory(item: HistoryItem) {
    setCampaign({ ...item, imageDataUrl: null, imageError: "This saved campaign retains its image prompt, not the generated image file." });
    setBrief(item.brief);
    setAudience(item.audience);
    setProductDetails(item.productDetails);
    setTone(item.tone);
    setChannels(item.channels);
    setNotice("Loaded a saved campaign from your account.");
    setError("");
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setError("Clipboard access is unavailable in this browser.");
    }
  }

  return (
    <>
      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 pb-28 sm:px-7 lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)] lg:py-8">
        <div className="space-y-5">
          <section className="rounded-2xl border border-[var(--balmz-orange)]/20 bg-[linear-gradient(135deg,rgba(249,115,22,0.12),rgba(17,26,39,0.92)_48%)] p-5 sm:p-6">
            <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--balmz-orange)]">CAMPAIGN BUILDER</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">Turn a brief into a launch plan.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Generate one campaign concept, three channel-ready copy variants, a launch checklist and a visual prompt. Your saved campaigns are private to your account.</p>
          </section>

          <Panel title="Campaign brief">
            <form onSubmit={generate} className="space-y-4">
              <Field label="What are you launching?" value={brief} onChange={setBrief} rows={4} placeholder="Describe the goal, offer, key differentiator and what success should look like. Avoid adding claims that have not been verified." />
              <Field label="Target audience" value={audience} onChange={setAudience} rows={3} placeholder="Who should this campaign reach? Include needs, context and buying motivations." />
              <Field label="Product or service details" value={productDetails} onChange={setProductDetails} rows={4} placeholder="Describe what the product does, approved facts, offer details, location, eligibility and restrictions." />
              <label className="block"><span className="mb-2 block text-xs font-medium text-slate-300">Tone</span><input value={tone} onChange={(event) => setTone(event.target.value)} maxLength={100} className="w-full rounded-xl border border-white/10 bg-[#080f19] px-3 py-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50" /></label>
              <div>
                <p className="mb-2 text-xs font-medium text-slate-300">Channels</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {channelOptions.map((channel) => <label key={channel} className={"flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs " + (channels.includes(channel) ? "border-[var(--balmz-orange)]/40 bg-[var(--balmz-orange)]/10 text-white" : "border-white/[0.08] bg-[#080f19] text-slate-400")}>
                    <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} className="accent-orange-500" />
                    {channel}
                  </label>)}
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-[#080f19] p-3 text-xs text-slate-300">
                <input type="checkbox" checked={generateImage} onChange={(event) => setGenerateImage(event.target.checked)} className="mt-0.5 accent-orange-500" />
                <span><strong className="font-semibold text-white">Generate campaign image</strong><span className="mt-1 block text-[10px] leading-4 text-slate-500">Uses one additional AI allowance. An image prompt is included even when this is off.</span></span>
              </label>
              {error ? <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-200">{error}</p> : null}
              {notice ? <p role="status" className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-200">{notice}</p> : null}
              <button type="submit" disabled={loading || !brief.trim() || !audience.trim() || !productDetails.trim() || !channels.length} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 py-3 text-sm font-bold text-[#17100a] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
                {loading ? "Building your campaign…" : "Generate campaign concept"}
              </button>
              <p className="text-[10px] leading-4 text-slate-600">Generation uses the connected OpenAI Responses API and your BALMZ AI message allowance. Provider usage may be billed separately by OpenAI.</p>
            </form>
          </Panel>

          <Panel title="Saved campaign history">
            {historyLoading ? <p className="text-xs text-slate-500">Loading saved campaigns…</p> : history.length ? <div className="space-y-2">
              {history.map((item) => <button key={item.id} type="button" onClick={() => openHistory(item)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#080f19] px-3 py-3 text-left hover:border-[var(--balmz-orange)]/30">
                <span className="min-w-0"><span className="block truncate text-xs font-medium text-slate-200">{item.result.title}</span><span className="mt-1 block text-[10px] text-slate-600">{new Date(item.createdAt).toLocaleString()}</span></span>
                <span className="shrink-0 text-xs text-[var(--balmz-orange)]">Open →</span>
              </button>)}
            </div> : <p className="text-xs text-slate-500">Your generated campaigns will appear here after the first save.</p>}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          {!campaign ? <Panel title="Your campaign will appear here"><div className="flex min-h-64 flex-col items-center justify-center text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/10 text-2xl text-[var(--balmz-orange)]">✳</div><p className="mt-4 text-sm font-semibold text-white">Ready when you are</p><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">Complete the brief and choose Generate campaign concept. The results will be saved to your BALMZ AI account.</p></div></Panel> : <>
            <Panel title={campaign.result.title}>
              <div className="space-y-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--balmz-orange)]">Campaign concept</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{campaign.result.concept}</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-[#080f19] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Audience insight</p><p className="mt-2 text-xs leading-5 text-slate-300">{campaign.result.audienceInsight}</p></div>
                  <div className="rounded-xl bg-[#080f19] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Key message</p><p className="mt-2 text-xs leading-5 text-slate-300">{campaign.result.keyMessage}</p></div>
                </div>
              </div>
            </Panel>

            <Panel title="Three channel copy variants">
              <div className="space-y-3">
                {campaign.result.variants.map((variant, index) => <article key={variant.channel + index} className="rounded-xl border border-white/[0.07] bg-[#080f19] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-[var(--balmz-orange)]">{variant.channel}</span><button type="button" onClick={() => void copyText(variant.headline + "\n\n" + variant.body + (variant.callToAction ? "\n\n" + variant.callToAction : ""))} className="text-[10px] text-slate-500 hover:text-white">Copy variant</button></div>
                  <h3 className="mt-3 text-base font-semibold leading-6 text-white">{variant.headline}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{variant.body}</p>
                  {variant.callToAction ? <p className="mt-3 text-xs font-semibold text-white">CTA: {variant.callToAction}</p> : null}
                </article>)}
              </div>
            </Panel>

            <Panel title="Launch checklist">
              <ol className="space-y-3">
                {campaign.result.launchChecklist.map((item, index) => <li key={index} className="flex gap-3 text-xs leading-5 text-slate-300"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] text-[var(--balmz-orange)]">{index + 1}</span>{item}</li>)}
              </ol>
            </Panel>

            <Panel title="Visual direction">
              {campaign.imageDataUrl ? <img src={campaign.imageDataUrl} alt="Generated campaign visual" className="mb-4 w-full rounded-xl border border-white/[0.08] object-cover" /> : <div className="mb-4 rounded-xl border border-dashed border-white/[0.12] bg-[#080f19] px-4 py-8 text-center text-xs text-slate-500">{campaign.imageError || "Image generation was not requested. The visual prompt is ready below."}</div>}
              <p className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{campaign.result.imagePrompt}</p>
              <button type="button" onClick={() => void copyText(campaign.result.imagePrompt)} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:text-white">Copy image prompt</button>
            </Panel>
          </>}
        </div>
      </div>
      <QuickChatHelper />
    </>
  );
}
