"use client";

import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";

type MediaMode = "image" | "text-to-video" | "image-to-video";
type MediaStatus = "SUBMITTING" | "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type MediaJob = {
  jobId: string;
  mode: MediaMode;
  prompt: string;
  model: string;
  ratio: "landscape" | "portrait" | "square";
  duration: number | null;
  status: MediaStatus;
  progress: number | null;
  output: string[];
  error: string | null;
  estimatedCredits: number | null;
  creditsUsed: number | null;
  createdAt: string;
};
type MediaResponse = {
  provider?: string;
  configured?: boolean;
  jobs?: MediaJob[];
  job?: MediaJob;
  outputNotice?: string;
  message?: string;
};

const activeStatuses = new Set<MediaStatus>(["SUBMITTING", "PENDING", "THROTTLED", "RUNNING"]);

function modeLabel(mode: MediaMode) {
  if (mode === "image") return "Image";
  if (mode === "text-to-video") return "Text to video";
  return "Image to video";
}

function statusLabel(status: MediaStatus) {
  if (status === "SUCCEEDED") return "Completed";
  if (status === "FAILED") return "Failed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "RUNNING") return "Generating";
  if (status === "THROTTLED") return "Queued by Runway";
  if (status === "SUBMITTING") return "Submitting";
  return "Queued";
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The selected image could not be read."));
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

export function RunwayMediaStudio() {
  const [mode, setMode] = useState<MediaMode>("image");
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<"landscape" | "portrait" | "square">("landscape");
  const [duration, setDuration] = useState("5");
  const [imageUrl, setImageUrl] = useState("");
  const [imageData, setImageData] = useState("");
  const [imageName, setImageName] = useState("");
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [configured, setConfigured] = useState(false);
  const [outputNotice, setOutputNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadJobs() {
    try {
      const response = await fetch("/api/media/runway", { cache: "no-store" });
      const payload = await response.json() as MediaResponse;
      if (!response.ok) throw new Error(payload.message || "Runway media status could not be loaded.");
      setConfigured(Boolean(payload.configured));
      setJobs(payload.jobs ?? []);
      setOutputNotice(payload.outputNotice ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Runway media status is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshJob(jobId: string) {
    try {
      const response = await fetch("/api/media/runway?jobId=" + encodeURIComponent(jobId), { cache: "no-store" });
      const payload = await response.json() as MediaResponse;
      if (!response.ok || !payload.job) return;
      setJobs((current) => current.map((job) => job.jobId === jobId ? payload.job! : job));
    } catch {
      // A later poll can retry transient network failures without losing the job.
    }
  }

  useEffect(() => { void loadJobs(); }, []);

  useEffect(() => {
    const active = jobs.filter((job) => activeStatuses.has(job.status));
    if (!active.length) return;
    const timer = window.setInterval(() => {
      for (const job of active) void refreshJob(job.jobId);
    }, 6_000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  async function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("The input image must be 4 MB or smaller.");
      event.target.value = "";
      return;
    }
    try {
      const data = await readImageFile(file);
      setImageData(data);
      setImageUrl("");
      setImageName(file.name);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected image could not be read.");
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating) return;
    if (mode === "image-to-video" && !imageData && !imageUrl.trim()) {
      setError("Choose an input image or paste a public HTTPS image URL.");
      return;
    }
    setGenerating(true);
    setError("");
    setNotice("");
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch("/api/media/runway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          mode,
          prompt,
          ratio,
          duration: Number(duration),
          ...(mode === "image-to-video" ? { imageInput: imageData || imageUrl.trim() } : {}),
        }),
      });
      const payload = await response.json() as MediaResponse;
      if (!response.ok || !payload.job) throw new Error(payload.message || "Runway could not start this generation.");
      setJobs((current) => [payload.job!, ...current.filter((job) => job.jobId !== payload.job!.jobId)].slice(0, 12));
      setNotice("Your Runway job has been submitted. BALMZ AI will track its progress here.");
      setPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Runway generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  function animateImage(url: string) {
    setMode("image-to-video");
    setImageUrl(url);
    setImageData("");
    setImageName("Selected generated image");
    setPrompt("Animate this image with natural, cinematic motion. " + prompt);
    setNotice("Image selected as the first-frame reference. Add movement details, then start image-to-video.");
    setError("");
  }

  const videoMode = mode !== "image";

  return (
    <section className="mx-auto mb-7 max-w-[1500px] px-4 pt-5 sm:px-7 sm:pt-7">
      <div className="overflow-hidden rounded-3xl border border-[var(--balmz-orange)]/20 bg-[linear-gradient(135deg,rgba(249,115,22,0.12),rgba(17,26,39,0.97)_44%)]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-[var(--balmz-orange)]">RUNWAY MEDIA STUDIO</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Create images and videos.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Generate original images, create videos from text, or animate an image. Your jobs are kept in your BALMZ AI account.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-slate-300">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Gen-4 Image</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Gen-4.5 Video</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Text and image input</span>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              {configured ? "Runway server credential detected." : "Runway is not configured. Add RUNWAYML_API_SECRET to the BALMZ AI Render service."}
            </p>
            {outputNotice ? <p className="mt-2 max-w-xl text-[11px] leading-5 text-amber-200/80">{outputNotice}</p> : null}
          </div>

          <form onSubmit={generate} className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#080f19]/80 p-4 sm:p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Create</span>
              <select value={mode} onChange={(event) => { const nextMode = event.target.value as MediaMode; setMode(nextMode); if (nextMode !== "image" && ratio === "square") setRatio("landscape"); setError(""); }} className="w-full rounded-xl border border-white/10 bg-[#111a27] px-3 py-3 text-sm text-white outline-none focus:border-[var(--balmz-orange)]/50">
                <option value="image">Image from prompt</option>
                <option value="text-to-video">Video from prompt</option>
                <option value="image-to-video">Animate an image</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">Describe what to create</span>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1000} rows={4} required placeholder="Describe the scene, subject, camera movement, lighting and visual style…" className="w-full resize-y rounded-xl border border-white/10 bg-[#111a27] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-[var(--balmz-orange)]/50" />
              <span className="mt-1 block text-right text-[10px] text-slate-600">{prompt.length}/1,000</span>
            </label>

            {mode === "image-to-video" ? (
              <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#111a27] p-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">Starting image</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleImageFile(event)} className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white" />
                </label>
                <p className="text-center text-[10px] text-slate-600">or use a public HTTPS image URL</p>
                <input type="url" value={imageUrl} onChange={(event) => { setImageUrl(event.target.value); setImageData(""); setImageName(""); }} placeholder="https://example.com/image.jpg" className="w-full rounded-lg border border-white/10 bg-[#080f19] px-3 py-2.5 text-xs text-white outline-none placeholder:text-slate-600" />
                {imageName ? <p className="text-[10px] text-emerald-300">Selected: {imageName}</p> : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-300">Format</span>
                <select value={ratio} onChange={(event) => setRatio(event.target.value as "landscape" | "portrait" | "square")} className="w-full rounded-xl border border-white/10 bg-[#111a27] px-3 py-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/50">
                  <option value="landscape">Landscape 16:9</option>
                  <option value="portrait">Portrait 9:16</option>
                  {!videoMode ? <option value="square">Square 1:1</option> : null}
                </select>
              </label>
              {videoMode ? (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-slate-300">Duration</span>
                  <select value={duration} onChange={(event) => setDuration(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#111a27] px-3 py-3 text-xs text-white outline-none focus:border-[var(--balmz-orange)]/50">
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </label>
              ) : <div className="flex items-end text-[10px] leading-4 text-slate-500">Images are generated as a task and appear below when ready.</div>}
            </div>

            {error ? <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-200">{error}</p> : null}
            {notice ? <p role="status" className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-xs text-emerald-200">{notice}</p> : null}
            <button type="submit" disabled={!configured || generating || !prompt.trim()} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--balmz-orange)] px-4 py-3 text-sm font-bold text-[#17100a] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
              {generating ? "Submitting to Runway…" : mode === "image" ? "Generate image" : "Generate video"}
            </button>
            <p className="text-[10px] leading-4 text-slate-600">Each generation uses one BALMZ AI message allowance and may also consume Runway project credits. Provider pricing is separate.</p>
          </form>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold text-white">Your media jobs</h2><p className="mt-1 text-[10px] text-slate-500">Recent generations saved to your account</p></div>
          <button type="button" onClick={() => void loadJobs()} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-slate-300 hover:bg-white/[0.05]">Refresh</button>
        </div>
        {loading ? <p className="rounded-xl border border-white/[0.07] bg-[#111a27] px-4 py-7 text-center text-xs text-slate-500">Loading your media jobs…</p>
          : jobs.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.map((job) => (
              <article key={job.jobId} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111a27]">
                {job.status === "SUCCEEDED" && job.output[0] ? (
                  job.mode === "image" ? <img src={job.output[0]} alt="Generated image" className="aspect-video w-full bg-black object-contain" />
                    : <video src={job.output[0]} controls playsInline preload="metadata" className="aspect-video w-full bg-black object-contain" />
                ) : <div className="flex aspect-video items-center justify-center bg-[#080f19] px-4 text-center">
                  <div><p className="text-xs font-semibold text-white">{statusLabel(job.status)}</p>{job.status === "RUNNING" && typeof job.progress === "number" ? <p className="mt-2 text-[10px] text-slate-500">{Math.round(job.progress * 100)}% complete</p> : null}{job.error ? <p className="mt-2 text-[10px] leading-4 text-rose-200">{job.error}</p> : null}</div>
                </div>}
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--balmz-orange)]">{modeLabel(job.mode)}</span><span className={"rounded-full px-2.5 py-1 text-[9px] " + (job.status === "SUCCEEDED" ? "bg-emerald-400/10 text-emerald-200" : job.status === "FAILED" ? "bg-rose-400/10 text-rose-200" : "bg-white/[0.07] text-slate-300")}>{statusLabel(job.status)}</span></div>
                  <p className="line-clamp-3 text-xs leading-5 text-slate-300">{job.prompt}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-600"><span>{new Date(job.createdAt).toLocaleString()}</span>{job.creditsUsed !== null ? <span>{job.creditsUsed} Runway credits</span> : job.estimatedCredits !== null ? <span>Est. {job.estimatedCredits} credits</span> : null}</div>
                  {job.status === "SUCCEEDED" && job.output.length ? (
                    <div className="flex flex-wrap gap-2">
                      <a href={job.output[0]} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-3 py-2 text-[10px] font-semibold text-white hover:bg-white/15">Open / save media</a>
                      {job.mode === "image" ? <button type="button" onClick={() => animateImage(job.output[0])} className="rounded-lg border border-[var(--balmz-orange)]/30 px-3 py-2 text-[10px] font-semibold text-[var(--balmz-orange)]">Animate this image</button> : null}
                    </div>
                  ) : null}
                  {job.status === "SUCCEEDED" ? <p className="text-[10px] leading-4 text-amber-200/75">Save this media promptly; Runway download links expire.</p> : activeStatuses.has(job.status) ? <p className="text-[10px] text-slate-500">Status refreshes automatically about every 6 seconds.</p> : null}
                  {job.status === "SUCCEEDED" ? <button type="button" onClick={() => void refreshJob(job.jobId)} className="text-[10px] text-slate-500 underline hover:text-white">Refresh media link</button> : null}
                </div>
              </article>
            ))}
          </div>
          : <p className="rounded-xl border border-white/[0.07] bg-[#111a27] px-4 py-7 text-center text-xs text-slate-500">No Runway generations yet. Start with a prompt above.</p>}
      </div>
    </section>
  );
}
