"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type LibraryImage = {
  id: string;
  title: string;
  filename: string;
  thumbnailUrl: string;
  originalUrl: string;
  descriptionUrl: string;
  creator: string;
  license: string;
  licenseUrl: string;
};
type Template = {
  title: string;
  category: string;
  description: string;
  prompt: string;
  mark: string;
  style: string;
};

const categories = [
  { id: "all", label: "All" },
  { id: "nature", label: "Nature" },
  { id: "animals", label: "Animals" },
  { id: "travel", label: "Travel" },
  { id: "art", label: "Art & illustration" },
  { id: "design", label: "Design" },
  { id: "people", label: "Portraits" },
];

const templates: Template[] = [
  {
    title: "Brand logo",
    category: "Branding",
    description: "A simple, memorable identity for a new business or project.",
    mark: "✳",
    style: "from-orange-400/25 via-amber-300/10 to-[#242424]",
    prompt: "Create an original, distinctive brand logo concept. Brand name: [BRAND NAME]. Industry: [INDUSTRY]. Values: [3 BRAND VALUES]. Create a clear symbol and wordmark that remain legible at small sizes. Use a restrained palette, clean geometry, strong contrast, and a transparent-background-ready composition. Do not imitate existing trademarks or use another company's logo.",
  },
  {
    title: "Social media post",
    category: "Social",
    description: "A polished visual for an Instagram, Facebook or LinkedIn post.",
    mark: "▧",
    style: "from-fuchsia-400/20 via-violet-400/10 to-[#242424]",
    prompt: "Design a polished 4:5 social media visual for [BRAND OR TOPIC]. Audience: [AUDIENCE]. Main message: [MESSAGE]. Visual direction: confident, clear, modern, and easy to understand on a phone. Leave intentional space for editable headline and logo placement. Avoid fake statistics, testimonials, or product claims.",
  },
  {
    title: "Product campaign",
    category: "Marketing",
    description: "A clean product hero image for a shop, launch or campaign.",
    mark: "◇",
    style: "from-cyan-300/20 via-blue-400/10 to-[#242424]",
    prompt: "Create a high-quality commercial product hero image for [PRODUCT]. Setting: [SETTING]. Lighting: soft studio lighting with realistic materials and natural shadows. Composition: product clearly visible, uncluttered background, premium art direction, generous negative space for a headline. Do not invent labels, certifications, or brand marks.",
  },
  {
    title: "Profile avatar",
    category: "Profile",
    description: "A friendly illustrated profile image with a consistent visual style.",
    mark: "◉",
    style: "from-emerald-300/20 via-teal-400/10 to-[#242424]",
    prompt: "Create an original profile avatar for [PERSONA OR CHARACTER]. Style: [ILLUSTRATION STYLE]. Expression: friendly and confident. Frame: centered head-and-shoulders portrait, simple background, balanced lighting, clean silhouette, suitable for a small circular crop. Do not depict a real person unless the user provides an authorized reference.",
  },
  {
    title: "Event poster",
    category: "Print",
    description: "A bold poster layout for an event, launch or community gathering.",
    mark: "▤",
    style: "from-rose-300/20 via-orange-400/10 to-[#242424]",
    prompt: "Design a bold event poster concept for [EVENT NAME]. Event type: [TYPE]. Audience: [AUDIENCE]. Mood: [MOOD]. Use a strong visual focal point, clear hierarchy, balanced negative space and a print-friendly portrait layout. Reserve separate editable areas for date, venue, registration link and organizer logo. Do not invent event details.",
  },
  {
    title: "Video thumbnail",
    category: "Video",
    description: "A high-contrast thumbnail composition that reads at small sizes.",
    mark: "▶",
    style: "from-amber-300/20 via-red-400/10 to-[#242424]",
    prompt: "Create a compelling 16:9 video thumbnail for [VIDEO TOPIC]. Main subject: [SUBJECT]. Desired emotion: [EMOTION]. Use one clear focal point, crisp lighting, strong contrast and a simple background. Keep important content away from the edges and leave space for a short editable title. Avoid misleading visual claims.",
  },
  {
    title: "Presentation cover",
    category: "Business",
    description: "A professional opening slide for a report or presentation.",
    mark: "▱",
    style: "from-sky-300/20 via-indigo-400/10 to-[#242424]",
    prompt: "Create a premium 16:9 presentation cover visual for [PRESENTATION TITLE]. Subject: [SUBJECT]. Audience: [AUDIENCE]. Style: minimal, professional, modern, with a clear focal visual and ample negative space for the title, subtitle and presenter. Use a restrained color palette and avoid adding unreadable text.",
  },
  {
    title: "Sticker / reaction art",
    category: "Illustration",
    description: "A playful original character or reaction graphic.",
    mark: "♡",
    style: "from-pink-300/20 via-purple-400/10 to-[#242424]",
    prompt: "Create an original expressive sticker illustration showing [CHARACTER OR IDEA] with [EMOTION]. Use a clean silhouette, expressive pose, bold readable shapes, a light outline and a transparent-background-ready composition. Keep the design original and avoid recognizable copyrighted characters.",
  },
];

export function ImagesWorkspace({ userName }: { userName: string }) {
  const [tab, setTab] = useState<"trending" | "templates">("trending");
  const [category, setCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadImages() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ category });
        if (appliedQuery) params.set("q", appliedQuery);
        const response = await fetch("/api/images/free-library?" + params.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as { images?: LibraryImage[]; message?: string };
        if (!response.ok) throw new Error(payload.message || "The image library could not be loaded.");
        setImages(Array.isArray(payload.images) ? payload.images : []);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "The image library is unavailable.");
        setImages([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadImages();
    return () => controller.abort();
  }, [category, appliedQuery]);

  const matchingTemplates = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    if (tab !== "templates" || !search) return templates;
    return templates.filter((item) =>
      (item.title + " " + item.category + " " + item.description).toLowerCase().includes(search),
    );
  }, [searchText, tab]);

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
      setError("");
    } catch {
      setError("Clipboard access is unavailable. You can still select and copy the prompt text.");
      setNotice("");
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedQuery(searchText.trim().slice(0, 100));
    setCategory("all");
    setTab("trending");
  }

  function imagePrompt(item: LibraryImage) {
    return [
      "Help me create an original visual inspired by this free reference image.",
      "Reference: " + item.descriptionUrl,
      "Creator: " + item.creator,
      "License: " + item.license + " (" + item.licenseUrl + ").",
      "Keep the new work original and do not copy protected logos or characters.",
    ].join("\n");
  }

  function useTemplate(item: Template) {
    window.location.assign("/dashboard?prompt=" + encodeURIComponent(item.prompt));
  }

  return (
    <main className="min-h-[100dvh] bg-[#212121] pb-16 text-[#f5f5f5]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-white/[0.07] bg-[#212121]/95 px-4 backdrop-blur-xl sm:px-7">
        <Link href="/dashboard" aria-label="Back to chat" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-2xl text-white transition hover:bg-white/[0.14]">←</Link>
        <div className="text-center">
          <p className="text-sm font-semibold">Images</p>
          <p className="hidden text-[10px] text-white/40 sm:block">Free image inspiration and reusable creative prompts</p>
        </div>
        <Link href="/dashboard/settings" aria-label={"Settings for " + userName} className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--balmz-orange)] text-xs font-bold text-[#17100a]">
          {userName.trim().slice(0, 1).toUpperCase() || "B"}
        </Link>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Make something visual.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Browse free-use reference images or start from a ready-to-adapt creative prompt.</p>
          </div>
          <a href="/balmz-logo.svg" download="balmz-ai-logo.svg" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/[0.07]">
            <span aria-hidden="true">↓</span> Download BALMZ logo
          </a>
        </div>

        <div className="mb-6 inline-flex rounded-full bg-white/[0.06] p-1">
          <button type="button" onClick={() => setTab("trending")} className={"rounded-full px-5 py-3 text-sm font-medium transition " + (tab === "trending" ? "bg-white/[0.18] text-white" : "text-white/55 hover:text-white")}>Trending</button>
          <button type="button" onClick={() => setTab("templates")} className={"rounded-full px-5 py-3 text-sm font-medium transition " + (tab === "templates" ? "bg-white/[0.18] text-white" : "text-white/55 hover:text-white")}>Templates</button>
        </div>

        {tab === "trending" ? (
          <>
            <form onSubmit={submitSearch} className="mb-5 flex w-full items-center gap-2 rounded-2xl border border-white/[0.08] bg-[#303030] p-2 focus-within:border-white/20">
              <span className="pl-3 text-white/45" aria-hidden="true">⌕</span>
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} maxLength={100} placeholder="Search free images" className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-white outline-none placeholder:text-white/40" />
              <button type="submit" className="rounded-xl bg-[var(--balmz-orange)] px-4 py-3 text-xs font-semibold text-[#17100a] transition hover:brightness-110">Search</button>
            </form>

            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
              {categories.map((item) => <button key={item.id} type="button" onClick={() => { setCategory(item.id); setAppliedQuery(""); setSearchText(""); }} className={"shrink-0 rounded-full border px-4 py-2 text-xs transition " + (category === item.id && !appliedQuery ? "border-white/10 bg-white/[0.16] text-white" : "border-white/[0.08] text-white/55 hover:bg-white/[0.06] hover:text-white")}>{item.label}</button>)}
            </div>

            <p className="mb-4 text-xs text-white/45">Free-use images from Wikimedia Commons. Trending here means curated inspiration, not a live popularity ranking.</p>

            {error ? <p role="alert" className="mb-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-4 py-3 text-sm text-rose-100">{error}</p> : null}
            {notice ? <p role="status" className="mb-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs text-emerald-100">{notice}</p> : null}
            {loading ? <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-3xl bg-white/[0.06]" />)}</div>
              : images.length ? <div className="columns-2 gap-4 md:columns-3 xl:columns-4">
                {images.map((item, index) => (
                  <article key={item.id} className="mb-4 break-inside-avoid overflow-hidden rounded-3xl bg-[#303030]">
                    <a href={item.descriptionUrl} target="_blank" rel="noreferrer" className="group relative block overflow-hidden bg-black/20">
                      <img src={item.thumbnailUrl} alt={item.title} loading="lazy" className={"w-full object-cover transition duration-500 group-hover:scale-[1.025] " + ([0, 3].includes(index % 5) ? "aspect-square" : index % 5 === 1 ? "aspect-[3/4]" : "aspect-[4/5]")} />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-12 text-xs font-medium text-white">{item.title}</span>
                    </a>
                    <div className="space-y-2 p-3">
                      <p className="line-clamp-2 text-[10px] leading-4 text-white/55">By {item.creator} · {item.license}</p>
                      <div className="flex flex-wrap gap-2">
                        <a href={item.originalUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-white/[0.09] px-3 py-2 text-[10px] font-semibold text-white/85 hover:bg-white/[0.15]">Open original</a>
                        <button type="button" onClick={() => void copyText(imagePrompt(item), "Reference and attribution details copied. Check the file license before publishing.")} className="rounded-lg border border-white/[0.1] px-3 py-2 text-[10px] font-semibold text-white/70 hover:bg-white/[0.06]">Copy credit</button>
                        <Link href={"/dashboard?prompt=" + encodeURIComponent(imagePrompt(item))} className="rounded-lg border border-[var(--balmz-orange)]/30 px-3 py-2 text-[10px] font-semibold text-[var(--balmz-orange)] hover:bg-[var(--balmz-orange)]/[0.08]">Use in chat</Link>
                      </div>
                      <a href={item.licenseUrl} target="_blank" rel="noreferrer" className="inline-block text-[10px] text-white/40 underline underline-offset-2">Review {item.license} license</a>
                    </div>
                  </article>
                ))}
              </div> : <div className="rounded-3xl border border-white/[0.08] bg-white/[0.025] px-6 py-16 text-center"><p className="text-sm font-semibold text-white">No images found</p><p className="mt-2 text-xs text-white/50">Try a broader search or choose another category.</p></div>}
            <p className="mt-8 text-center text-xs text-white/40">Images provided by <a className="underline underline-offset-2" href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">Wikimedia Commons</a>. Every file has its own reuse terms; check the linked file page before using it in a commercial project.</p>
          </>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div><h2 className="text-lg font-semibold">Creative templates</h2><p className="mt-1 text-xs text-white/45">Copy a prompt and adapt it for your brand, content or project.</p></div>
              <input aria-label="Search templates" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Find a template" className="w-full max-w-xs rounded-full border border-white/[0.1] bg-[#303030] px-4 py-3 text-xs text-white outline-none placeholder:text-white/40 focus:border-white/25" />
            </div>

            <section className="mb-7 grid gap-4 rounded-3xl border border-white/[0.08] bg-[#303030] p-4 sm:grid-cols-[104px_1fr_auto] sm:items-center sm:p-5">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-black/30 p-3"><Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={80} height={80} /></div>
              <div className="min-w-0"><p className="text-sm font-semibold">BALMZ AI brand logo</p><p className="mt-1 text-xs leading-5 text-white/50">The official BALMZ shield logo in scalable SVG format, ready to reuse in the app and approved BALMZ AI materials.</p></div>
              <a href="/balmz-logo.svg" download="balmz-ai-logo.svg" className="rounded-full bg-[var(--balmz-orange)] px-4 py-3 text-center text-xs font-semibold text-[#17100a]">Download SVG</a>
            </section>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {matchingTemplates.map((item) => (
                <article key={item.title} className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#303030]">
                  <div className={"flex aspect-[4/3] items-center justify-center bg-gradient-to-br " + item.style}>
                    <div className="flex h-28 w-28 items-center justify-center rounded-[32px] border border-white/20 bg-black/20 text-5xl text-white shadow-2xl">{item.mark}</div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{item.title}</p><span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-[10px] text-white/50">{item.category}</span></div>
                    <p className="mt-2 min-h-10 text-xs leading-5 text-white/50">{item.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copyText(item.prompt, "Template prompt copied. You can adapt it before using it.")} className="rounded-xl border border-white/[0.12] px-3 py-2.5 text-[10px] font-semibold text-white/80 hover:bg-white/[0.06]">Copy prompt</button>
                      <button type="button" onClick={() => useTemplate(item)} className="rounded-xl bg-[var(--balmz-orange)] px-3 py-2.5 text-[10px] font-semibold text-[#17100a] hover:brightness-110">Use in chat</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!matchingTemplates.length ? <p className="rounded-2xl border border-white/[0.08] px-5 py-10 text-center text-sm text-white/50">No matching templates.</p> : null}
            {notice ? <p role="status" className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs text-emerald-100">{notice}</p> : null}
            {error ? <p role="alert" className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-4 py-3 text-sm text-rose-100">{error}</p> : null}
          </>
        )}
      </div>
    </main>
  );
}
