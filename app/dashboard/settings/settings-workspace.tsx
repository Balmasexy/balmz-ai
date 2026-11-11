"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/app/components/sign-out-button";
import { NativeCapabilitiesSection } from "./native-capabilities";

type Props = { name: string; email: string; planName: string | null; isAdmin: boolean };
type SettingRow = { id: string; icon: string; label: string; value: string; href?: string; muted?: boolean };

const rowStyle = "flex min-h-[70px] w-full items-center gap-4 px-5 text-left transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--balmz-orange)]";
const rows: SettingRow[] = [
  { id: "workspace", icon: "▣", label: "Workspace", value: "Personal" },
  { id: "upgrade", icon: "✧", label: "Upgrade plan", value: "View plans", href: "/dashboard/billing" },
  { id: "usage", icon: "▥", label: "Usage and limits", value: "View usage", href: "/dashboard/usage" },
  { id: "plugins", icon: "⌘", label: "Plugins and connectors", value: "Explore", href: "/dashboard/plugins" },
];

function SettingGroup({ items }: { items: SettingRow[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#303030] shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
      {items.map((item, index) => {
        const content = <>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center text-[25px] leading-none ${item.id === "upgrade" ? "text-sky-300" : "text-slate-100"}`} aria-hidden="true">{item.icon}</span>
          <span className="min-w-0 flex-1 text-[15px] font-medium text-slate-100 sm:text-base">{item.label}</span>
          <span className="max-w-[48%] truncate text-right text-[13px] text-white/55 sm:text-sm">{item.value}</span>
          {item.href ? <span className="ml-1 text-xl leading-none text-white/55" aria-hidden="true">›</span> : null}
        </>;
        return item.href
          ? <Link key={item.id} href={item.href} className={rowStyle + (index ? " border-t border-white/[0.11]" : "")}>{content}</Link>
          : <div key={item.id} className={rowStyle + " cursor-default hover:bg-transparent" + (index ? " border-t border-white/[0.11]" : "")}>{content}</div>;
      })}
    </div>
  );
}

export function SettingsWorkspace({ name, email, planName, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const accountRows = useMemo(() => rows.filter((item) => !query || (item.label + " " + item.value).toLowerCase().includes(query)), [query]);
  const identityRows: SettingRow[] = [
    { id: "name", icon: "◎", label: "Name", value: name },
    { id: "email", icon: "✉", label: "Email", value: email },
    { id: "phone", icon: "⌕", label: "Phone number", value: "Not added", muted: true },
    { id: "age", icon: "♙", label: "Age", value: "Not collected", muted: true },
  ].filter((item) => !query || (item.label + " " + item.value).toLowerCase().includes(query));
  const appearanceRows: SettingRow[] = [
    { id: "appearance", icon: "☼", label: "Appearance", value: "Dark" },
    { id: "accent", icon: "⚒", label: "Accent color", value: "BALMZ Orange · #FF6900" },
  ].filter((item) => !query || (item.label + " " + item.value).toLowerCase().includes(query));

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-black pb-28 text-white">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-white/[0.07] bg-black/90 px-4 backdrop-blur-xl sm:px-8">
        <Link href="/dashboard" aria-label="Back to BALMZ AI" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.13] text-2xl text-white transition hover:bg-white/[0.2]">←</Link>
        <p className="text-sm font-semibold">Settings</p>
        <div className="w-11" />
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-7 sm:px-8 sm:pt-9">
        <section className="mb-9 flex flex-col items-center text-center">
          <div className="relative flex h-[112px] w-[112px] items-center justify-center rounded-full border border-white/10 bg-[var(--balmz-orange)] text-4xl font-medium text-[#1c1108] shadow-[0_0_44px_rgba(255,105,0,0.12)]">
            {name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "B"}
          </div>
          <h1 className="mt-5 text-xl font-semibold text-white">{name}</h1>
          <p className="mt-1 text-xs text-white/45">{planName || "Personal account · No active plan"}</p>
        </section>

        <div className="space-y-3">
          <p className="px-1 text-sm text-white/60">Account</p>
          <SettingGroup items={accountRows} />
          <SettingGroup items={identityRows} />
          <NativeCapabilitiesSection />
          <p className="px-1 pt-5 text-sm text-white/60">Preferences</p>
          <SettingGroup items={appearanceRows} />
          {isAdmin ? <>
            <p className="px-1 pt-5 text-sm text-white/60">Administration</p>
            <SettingGroup items={[
              { id: "admin", icon: "⌘", label: "Super Admin workplace", value: "Manage", href: "/admin" },
            ].filter((item) => !query || (item.label + " " + item.value).toLowerCase().includes(query))} />
          </> : null}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2 text-[11px] text-white/35">
            <span>Signed in as {email}</span>
            <span>Current plan: {planName || "None"}</span>
          </div>
          <div className="flex items-center justify-end px-1"><SignOutButton /></div>
          <p className="px-1 pt-3 text-center text-[10px] leading-5 text-white/30">Phone number and age are not collected by this BALMZ AI account profile. Dark appearance and the brand orange are kept consistent across the workplace.</p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/95 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-5">
        <label className="mx-auto flex max-w-3xl items-center gap-4 rounded-full border border-white/[0.08] bg-[#303030] px-5 py-4 shadow-[0_8px_36px_rgba(0,0,0,0.5)]">
          <span className="text-2xl text-white/60" aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search settings" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55" />
          {search ? <button type="button" onClick={() => setSearch("")} className="text-xs text-white/60">Clear</button> : null}
        </label>
      </div>
    </main>
  );
}
