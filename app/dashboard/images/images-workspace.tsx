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
  previewUrl: string;
};

const categories = [
  { id: "all", label: "All" },
  { id: "nature", label: "Nature" },
  { id: "animals", label: "Animals" },
  { id: "travel", label: "Travel" },
  { id: "art", label: "Art & illustration" },
  { id: "design", label: "Design" },
  { id: "people", label: "Portraits" },
  { id: "food", label: "Food" },
  { id: "technology", label: "Technology" },
  { id: "architecture", label: "Architecture" },
  { id: "business", label: "Business" },
  { id: "fashion", label: "Fashion" },
  { id: "sports", label: "Sports" },
  { id: "education", label: "Education" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "space", label: "Space" },
  { id: "backgrounds", label: "Backgrounds" },
  { id: "wallpapers", label: "Wallpapers" },
];

const templates: Template[] = [
  {
    title: "Brand logo",
    previewUrl: "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=900&q=82",
    category: "Branding",
    description: "A simple, memorable identity for a new business or project.",
    mark: "✳",
    style: "from-orange-400/25 via-amber-300/10 to-[#242424]",
    prompt: "Create an original, distinctive brand logo concept. Brand name: [BRAND NAME]. Industry: [INDUSTRY]. Values: [3 BRAND VALUES]. Create a clear symbol and wordmark that remain legible at small sizes. Use a restrained palette, clean geometry, strong contrast, and a transparent-background-ready composition. Do not imitate existing trademarks or use another company's logo.",
  },
  {
    title: "Social media post",
    previewUrl: "https://images.unsplash.com/photo-1558655146-9f40138edfeb?auto=format&fit=crop&w=900&q=82",
    category: "Social",
    description: "A polished visual for an Instagram, Facebook or LinkedIn post.",
    mark: "▧",
    style: "from-fuchsia-400/20 via-violet-400/10 to-[#242424]",
    prompt: "Design a polished 4:5 social media visual for [BRAND OR TOPIC]. Audience: [AUDIENCE]. Main message: [MESSAGE]. Visual direction: confident, clear, modern, and easy to understand on a phone. Leave intentional space for editable headline and logo placement. Avoid fake statistics, testimonials, or product claims.",
  },
  {
    title: "Product campaign",
    previewUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=82",
    category: "Marketing",
    description: "A clean product hero image for a shop, launch or campaign.",
    mark: "◇",
    style: "from-cyan-300/20 via-blue-400/10 to-[#242424]",
    prompt: "Create a high-quality commercial product hero image for [PRODUCT]. Setting: [SETTING]. Lighting: soft studio lighting with realistic materials and natural shadows. Composition: product clearly visible, uncluttered background, premium art direction, generous negative space for a headline. Do not invent labels, certifications, or brand marks.",
  },
  {
    title: "Profile avatar",
    previewUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=82",
    category: "Profile",
    description: "A friendly illustrated profile image with a consistent visual style.",
    mark: "◉",
    style: "from-emerald-300/20 via-teal-400/10 to-[#242424]",
    prompt: "Create an original profile avatar for [PERSONA OR CHARACTER]. Style: [ILLUSTRATION STYLE]. Expression: friendly and confident. Frame: centered head-and-shoulders portrait, simple background, balanced lighting, clean silhouette, suitable for a small circular crop. Do not depict a real person unless the user provides an authorized reference.",
  },
  {
    title: "Event poster",
    previewUrl: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=82",
    category: "Print",
    description: "A bold poster layout for an event, launch or community gathering.",
    mark: "▤",
    style: "from-rose-300/20 via-orange-400/10 to-[#242424]",
    prompt: "Design a bold event poster concept for [EVENT NAME]. Event type: [TYPE]. Audience: [AUDIENCE]. Mood: [MOOD]. Use a strong visual focal point, clear hierarchy, balanced negative space and a print-friendly portrait layout. Reserve separate editable areas for date, venue, registration link and organizer logo. Do not invent event details.",
  },
  {
    title: "Video thumbnail",
    previewUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=82",
    category: "Video",
    description: "A high-contrast thumbnail composition that reads at small sizes.",
    mark: "▶",
    style: "from-amber-300/20 via-red-400/10 to-[#242424]",
    prompt: "Create a compelling 16:9 video thumbnail for [VIDEO TOPIC]. Main subject: [SUBJECT]. Desired emotion: [EMOTION]. Use one clear focal point, crisp lighting, strong contrast and a simple background. Keep important content away from the edges and leave space for a short editable title. Avoid misleading visual claims.",
  },
  {
    title: "Presentation cover",
    previewUrl: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=82",
    category: "Business",
    description: "A professional opening slide for a report or presentation.",
    mark: "▱",
    style: "from-sky-300/20 via-indigo-400/10 to-[#242424]",
    prompt: "Create a premium 16:9 presentation cover visual for [PRESENTATION TITLE]. Subject: [SUBJECT]. Audience: [AUDIENCE]. Style: minimal, professional, modern, with a clear focal visual and ample negative space for the title, subtitle and presenter. Use a restrained color palette and avoid adding unreadable text.",
  },
  {
    title: "Sticker / reaction art",
    previewUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=900&q=82",
    category: "Illustration",
    description: "A playful original character or reaction graphic.",
    mark: "♡",
    style: "from-pink-300/20 via-purple-400/10 to-[#242424]",
    prompt: "Create an original expressive sticker illustration showing [CHARACTER OR IDEA] with [EMOTION]. Use a clean silhouette, expressive pose, bold readable shapes, a light outline and a transparent-background-ready composition. Keep the design original and avoid recognizable copyrighted characters.",
  },

  {
    title: "Business card",
    category: "Branding",
    description: "A polished, print-ready business card concept with clear contact hierarchy.",
    mark: "▤",
    style: "from-orange-400/25 via-amber-300/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1589330694653-ded6df03f754?auto=format&fit=crop&w=900&q=82",
    prompt: "Design a premium double-sided business card for [FULL NAME], [ROLE] at [BRAND]. Include only these supplied details: [PHONE], [EMAIL], [WEBSITE], [ADDRESS]. Use a strong typographic hierarchy, a restrained brand palette, clear margins, print-safe bleed guidance and a distinctive but readable layout. Do not invent contact information or certifications.",
  },
  {
    title: "Flyer",
    category: "Marketing",
    description: "An eye-catching promotional flyer for a product, service or community event.",
    mark: "▧",
    style: "from-fuchsia-400/20 via-violet-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=900&q=82",
    prompt: "Create a clear promotional flyer for [OFFER OR EVENT]. Audience: [AUDIENCE]. Main message: [MESSAGE]. Include only confirmed details: [DATE], [LOCATION], [CONTACT OR URL]. Use a strong headline, a single focal image, readable hierarchy and a mobile-friendly version. Do not invent discounts, dates, endorsements or claims.",
  },
  {
    title: "Restaurant menu",
    category: "Food & hospitality",
    description: "A clean menu layout with legible sections, prices and dietary labels.",
    mark: "≋",
    style: "from-emerald-300/20 via-teal-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=82",
    prompt: "Design a restaurant menu for [RESTAURANT NAME]. Cuisine and mood: [CUISINE / MOOD]. Use the exact supplied dishes and prices: [MENU ITEMS AND PRICES]. Organize into clear sections, make prices easy to scan, and reserve space for supplied allergen and dietary information. Never invent dishes, ingredients, allergens, prices or certifications.",
  },
  {
    title: "Website hero",
    category: "Web design",
    description: "A responsive homepage hero with an obvious headline and call to action.",
    mark: "▱",
    style: "from-cyan-300/20 via-blue-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=82",
    prompt: "Create a responsive website homepage hero for [BRAND / PRODUCT]. Target audience: [AUDIENCE]. Value proposition: [VERIFIED VALUE PROPOSITION]. Primary action: [CTA]. Use a clear visual focal point, accessible contrast, spacious composition, and mobile-first cropping. Do not fabricate customer logos, performance numbers, awards or testimonials.",
  },
  {
    title: "Mobile app concept",
    category: "Product design",
    description: "A cohesive mobile UI concept with realistic screens and clear information hierarchy.",
    mark: "▣",
    style: "from-sky-300/20 via-indigo-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9?auto=format&fit=crop&w=900&q=82",
    prompt: "Create a mobile app UI concept for [APP PURPOSE]. Primary users: [USERS]. Main task: [TASK]. Show a consistent navigation pattern, readable typography, accessible controls, realistic empty/loading/error states and a coherent color system. Use realistic but clearly illustrative sample content; do not imply real accounts, balances or transactions.",
  },
  {
    title: "Book cover",
    category: "Publishing",
    description: "A distinctive book-cover direction with title, subtitle and author placement.",
    mark: "▤",
    style: "from-rose-300/20 via-orange-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=82",
    prompt: "Design an original front-cover concept for [BOOK TITLE] by [AUTHOR]. Genre: [GENRE]. Intended reader: [READER]. Mood: [MOOD]. Create one strong focal idea, legible title placement, clear author hierarchy and a thumbnail-readable composition. Do not imitate existing covers or add review quotes, awards or publisher marks that were not supplied.",
  },
  {
    title: "Podcast cover",
    category: "Audio",
    description: "A square podcast identity that remains recognizable at small sizes.",
    mark: "◉",
    style: "from-violet-300/20 via-pink-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=82",
    prompt: "Create a square podcast cover for [SHOW NAME]. Topic: [TOPIC]. Host: [HOST]. Audience: [AUDIENCE]. Use a bold focal symbol or supplied host portrait, large readable title lettering, strong contrast and safe margins for platform crops. Do not invent guest names, sponsors or platform badges.",
  },
  {
    title: "Product mockup",
    category: "Product design",
    description: "A realistic presentation scene for packaging, merchandise or digital products.",
    mark: "◇",
    style: "from-amber-300/20 via-red-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=82",
    prompt: "Create a realistic mockup presentation for [PRODUCT]. Use the supplied product artwork and exact brand colors: [COLORS]. Scene: [SETTING]. Show believable material, scale, lighting and shadows. Keep the logo and labels faithful to supplied assets; do not invent certifications, ingredients, performance claims or packaging text.",
  },
  {
    title: "Infographic",
    category: "Editorial",
    description: "A structured visual explanation built from verified facts supplied by the user.",
    mark: "▥",
    style: "from-sky-300/20 via-indigo-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=82",
    prompt: "Create an infographic explaining [TOPIC] for [AUDIENCE]. Use only these verified facts and values: [DATA]. Organize the information into a clear visual sequence with labels, simple charts where appropriate and concise annotations. Do not create missing numbers, percentages, sources or conclusions; clearly identify any unavailable data.",
  },
  {
    title: "Invitation",
    category: "Events",
    description: "A refined invitation layout with all essential event details.",
    mark: "✉",
    style: "from-pink-300/20 via-purple-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=900&q=82",
    prompt: "Design an invitation for [EVENT NAME]. Occasion: [OCCASION]. Style: [STYLE]. Include only these details: [DATE], [TIME], [VENUE], [RSVP CONTACT]. Make the event name and key logistics easy to read, provide a print-friendly layout and a phone-sized version. Do not invent event details.",
  },
  {
    title: "Advertising creative",
    category: "Advertising",
    description: "A campaign visual with a strong hook and clear space for approved copy.",
    mark: "✦",
    style: "from-amber-300/20 via-orange-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=82",
    prompt: "Create an advertising creative for [PRODUCT OR SERVICE]. Audience: [AUDIENCE]. Approved offer: [OFFER]. Campaign goal: [GOAL]. Build one strong focal point, a concise visual hook, accessible contrast and a clear CTA area. Use only verified product benefits and approved offer terms; do not invent guarantees, prices, savings, testimonials or regulatory claims.",
  },
  {
    title: "Presentation layout",
    category: "Business",
    description: "A clean slide system for title, agenda, data, comparison and closing slides.",
    mark: "▱",
    style: "from-sky-300/20 via-blue-400/10 to-[#242424]",
    previewUrl: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=82",
    prompt: "Create a consistent 16:9 presentation slide system for [PRESENTATION]. Audience: [AUDIENCE]. Brand colors: [COLORS]. Include title, agenda, section divider, key message, evidence/data, comparison and closing layouts. Preserve supplied facts and chart values exactly. Use large readable type, strong alignment and restrained decoration; do not fabricate metrics or citations.",
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
  const [sourceNotice, setSourceNotice] = useState("");

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
        const payload = await response.json() as { images?: LibraryImage[]; message?: string; notice?: string; source?: string };
        if (!response.ok) throw new Error(payload.message || "The image library could not be loaded.");
        setImages(Array.isArray(payload.images) ? payload.images : []);
        setSourceNotice(payload.notice ? `${payload.source ?? "Image library"} · ${payload.notice}` : payload.source ?? "Image library");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "The image library is unavailable.");
        setImages([]);
        setSourceNotice("");
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

            <p className="mb-4 text-xs text-white/45">Free-use image references from Wikimedia Commons and curated Unsplash results. Trending means curated inspiration, not a live popularity ranking.</p>
            {sourceNotice ? <p className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-[11px] leading-5 text-white/55">{sourceNotice}</p> : null}

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
                  <div className={"relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br " + item.style}>
                    <img src={item.previewUrl} alt={item.title + " visual preview"} loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/10" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-black/35 text-3xl text-white shadow-2xl backdrop-blur-sm">{item.mark}</div>
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
