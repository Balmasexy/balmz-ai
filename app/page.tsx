"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import {
  useWidgetProps,
  useMaxHeight,
  useDisplayMode,
  useRequestDisplayMode,
  useIsChatGptApp,
} from "./hooks";

export default function Home() {
  const toolOutput = useWidgetProps<{
    name?: string;
    result?: { structuredContent?: { name?: string } };
  }>();
  const maxHeight = useMaxHeight() ?? undefined;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const isChatGptApp = useIsChatGptApp();
  const name = toolOutput?.result?.structuredContent?.name || toolOutput?.name;
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [draft, setDraft] = useState("");

  function startWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = new URL("/sign-up", window.location.origin);
    if (draft.trim()) destination.searchParams.set("prompt", draft.trim().slice(0, 4000));
    window.location.assign(destination.pathname + destination.search);
  }

  const navigation = (
    <>
      <Link href="/sign-in?next=%2Fdashboard" onClick={() => setMobileNavigation(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 transition hover:bg-white/[0.07]">
        <span className="text-lg">＋</span> New chat
      </Link>
      <Link href="/dashboard/images" onClick={() => setMobileNavigation(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 transition hover:bg-white/[0.07]">
        <span className="text-lg">▧</span> Images
      </Link>
      <Link href="/sign-in?next=%2Fdashboard%2Fsettings" onClick={() => setMobileNavigation(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 transition hover:bg-white/[0.07]">
        <span className="text-lg">⚙</span> Customize
      </Link>
      <Link href="/sign-in?next=%2Fdashboard%2Fcampaign-studio" onClick={() => setMobileNavigation(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 transition hover:bg-white/[0.07]">
        <span className="text-lg">▱</span> Projects & campaigns
      </Link>
      <Link href="/sign-in?next=%2Fdashboard%2Fplugins" onClick={() => setMobileNavigation(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 transition hover:bg-white/[0.07]">
        <span className="text-lg">◇</span> Explore tools
      </Link>
    </>
  );

  return (
    <main
      className="flex min-h-screen bg-[#212121] text-[#f5f5f5]"
      style={{
        maxHeight,
        height: displayMode === "fullscreen" ? maxHeight : undefined,
      }}
    >
      {displayMode !== "fullscreen" && isChatGptApp ? (
        <button
          type="button"
          aria-label="Enter fullscreen"
          onClick={() => requestDisplayMode("fullscreen")}
          className="fixed right-4 top-4 z-50 rounded-full border border-white/10 bg-white/10 p-3 text-white shadow-lg transition hover:bg-white/20"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
      ) : null}

      {mobileNavigation ? <button type="button" aria-label="Close navigation" onClick={() => setMobileNavigation(false)} className="fixed inset-0 z-30 bg-black/60 md:hidden" /> : null}

      <aside className={"fixed inset-y-0 left-0 z-40 flex w-[270px] flex-col border-r border-white/[0.06] bg-[#171717] p-3 transition-transform duration-200 md:static md:translate-x-0 " + (mobileNavigation ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={34} height={34} priority className="h-9 w-9 rounded-xl object-contain" />
            <span className="text-sm font-bold tracking-[0.14em]">BALMZ AI</span>
          </Link>
          <button type="button" onClick={() => setMobileNavigation(false)} aria-label="Close menu" className="rounded-lg p-2 text-white/50 hover:bg-white/[0.08] md:hidden">×</button>
        </div>
        <nav className="mt-5 space-y-1">{navigation}</nav>
        <div className="mt-auto space-y-2 border-t border-white/[0.07] px-2 pt-4">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Your workspace</p>
          <p className="px-2 text-xs leading-5 text-white/45">Sign in to keep chats, images and projects together in one private workspace.</p>
          <Link href="/sign-in" className="flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 text-sm font-medium text-white transition hover:bg-white/[0.07]">Log in</Link>
          <Link href="/sign-up" className="flex min-h-11 items-center justify-center rounded-full bg-[var(--balmz-orange)] px-4 text-sm font-semibold text-[#17100a] transition hover:brightness-110">Create account</Link>
        </div>
      </aside>

      <section className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavigation(true)} aria-label="Open navigation" className="rounded-lg p-2 text-white/65 transition hover:bg-white/[0.07] md:hidden">☰</button>
            <span className="text-sm font-semibold text-white/90">BALMZ AI</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className="rounded-full px-4 py-2.5 text-xs font-medium text-white/75 transition hover:bg-white/[0.07]">Log in</Link>
            <Link href="/sign-up" className="rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-[#171717] transition hover:bg-white/85">Sign up</Link>
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-4 sm:px-8">
          <div className="w-full max-w-3xl">
            <div className="mb-8 text-center">
              <Image src="/balmz-logo.svg" alt="BALMZ AI" width={54} height={54} className="mx-auto mb-5 h-14 w-14 rounded-2xl object-contain" />
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">What can I help you create?</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/50">Ask, explore, research and create in one personal AI workspace.</p>
            </div>

            <form onSubmit={startWorkspace} className="rounded-[28px] border border-white/[0.08] bg-[#303030] p-3 shadow-2xl shadow-black/20 transition focus-within:border-white/20">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={4000} placeholder="Message BALMZ AI…" className="max-h-48 min-h-[86px] w-full resize-y bg-transparent px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/40" />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-2 pt-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                  <Link href="/dashboard/images" className="rounded-full border border-white/[0.1] px-3 py-2 transition hover:bg-white/[0.07]">▧ Images</Link>
                  <Link href="/sign-in?next=%2Fdashboard%2Fcampaign-studio" className="rounded-full border border-white/[0.1] px-3 py-2 transition hover:bg-white/[0.07]">✳ Campaigns</Link>
                  <Link href="/sign-in?next=%2Fdashboard%2Fplugins" className="rounded-full border border-white/[0.1] px-3 py-2 transition hover:bg-white/[0.07]">◇ Explore</Link>
                </div>
                <button type="submit" className="flex h-10 items-center gap-2 rounded-full bg-[var(--balmz-orange)] px-5 text-xs font-semibold text-[#17100a] transition hover:brightness-110">
                  {draft.trim() ? "Continue" : "Get started"} <span aria-hidden="true">↑</span>
                </button>
              </div>
            </form>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <Link href="/sign-in?next=%2Fdashboard" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:bg-white/[0.05]">
                <span className="text-lg text-[var(--balmz-orange)]">✧</span><span className="mt-3 block text-sm font-medium text-white">Chat and research</span><span className="mt-1 block text-xs leading-5 text-white/45">Work through questions and ideas with your AI assistant.</span>
              </Link>
              <Link href="/dashboard/images" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:bg-white/[0.05]">
                <span className="text-lg text-[var(--balmz-orange)]">▧</span><span className="mt-3 block text-sm font-medium text-white">Images and templates</span><span className="mt-1 block text-xs leading-5 text-white/45">Browse free-use references and reusable creative prompts.</span>
              </Link>
              <Link href="/sign-in?next=%2Fdashboard%2Fcampaign-studio" className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:bg-white/[0.05]">
                <span className="text-lg text-[var(--balmz-orange)]">▱</span><span className="mt-3 block text-sm font-medium text-white">Projects and campaigns</span><span className="mt-1 block text-xs leading-5 text-white/45">Turn a brief into channel-ready campaign material.</span>
              </Link>
            </div>
          </div>
        </div>

        <footer className="px-4 pb-5 text-center text-[10px] text-white/30">BALMZ AI · Your Crypto. Your Freedom. · Secure personal workspace</footer>
        {isChatGptApp && name ? <p className="pb-3 text-center text-[10px] text-white/35">Connected app session: {name}</p> : null}
      </section>
    </main>
  );
}
