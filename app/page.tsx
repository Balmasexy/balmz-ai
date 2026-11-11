"use client";

import Link from "next/link";
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

  return (
    <main
      className="min-h-screen bg-[#080c14] text-white"
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
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
            />
          </svg>
        </button>
      ) : null}

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/10 py-6">
          <Link href="/" className="text-sm font-bold tracking-[0.22em] text-orange-400">
            BALMZ AI
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/sign-in" className="rounded-xl px-3 py-2 text-slate-300 transition hover:text-white">
              Sign in
            </Link>
            <Link href="/sign-up" className="rounded-xl bg-orange-500 px-4 py-2 font-semibold text-[#17100a] transition hover:bg-orange-600">
              Create account
            </Link>
          </nav>
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="inline-flex rounded-full border border-orange-400/25 bg-orange-400/10 px-3 py-1 text-xs font-semibold tracking-[0.15em] text-orange-300">
              YOUR AI WORKPLACE
            </p>
            <h1 className="mt-7 text-5xl font-semibold leading-[1.08] tracking-tight sm:text-7xl">
              Think clearly.
              <span className="block text-orange-400">Build boldly.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">
              Bring your research, ideas, and everyday work into one secure AI workspace.
              Your account and subscription controls stay connected to your own BALMZ AI database.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/sign-up" className="rounded-xl bg-orange-500 px-6 py-3 font-semibold text-[#17100a] transition hover:bg-orange-600">
                Start your workspace
              </Link>
              <Link href="/sign-in" className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white transition hover:bg-white/10">
                Sign in
              </Link>
            </div>
            {isChatGptApp && name ? (
              <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
                Connected Apps SDK session: <span className="font-semibold text-white">{name}</span>
              </div>
            ) : null}
          </div>
        </section>

        <footer className="border-t border-white/10 py-5 text-xs text-slate-500">
          BALMZ AI · Secure accounts · Server-managed subscriptions
        </footer>
      </div>
    </main>
  );
}
