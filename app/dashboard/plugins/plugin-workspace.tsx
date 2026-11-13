"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { openNativeBrowser, showNativeToast } from "@/lib/capacitor/native-helpers";

type Plugin = {
  id: string;
  name: string;
  category: "AI" | "Work" | "Developer" | "Finance" | "Infrastructure";
  description: string;
  capabilities: string[];
  route: string;
  access: "admin" | "billing" | "info";
  provider: string;
  externalUrl?: string;
};

const plugins: Plugin[] = [
  { id: "openai", name: "ChatGPT / OpenAI", category: "AI", description: "Use the workspace’s shared, administrator-tested OpenAI connection in BALMZ AI chat. Provider credentials stay on the server.", capabilities: ["Chat", "GPT models", "Usage metering"], route: "/dashboard", access: "info", provider: "OpenAI" },
  { id: "models", name: "AI model providers", category: "AI", description: "Select any shared, tested provider model enabled by the administrator from the ChatGPT-style model selector.", capabilities: ["Chat", "Model selection", "Provider switching"], route: "/dashboard", access: "info", provider: "BALMZ AI" },
  { id: "general-language-api", name: "General Language API", category: "AI", description: "Connect an OpenAI-compatible language-model API using its HTTPS endpoint, model ID and a server-encrypted API key. The configured model then appears in the ChatGPT-style model selector.", capabilities: ["Custom language model", "Model discovery", "Server-side encrypted key"], route: "/admin?section=ai-connections", access: "admin", provider: "General Language API" },
  { id: "github", name: "GitHub", category: "Developer", description: "Connect repositories for code, issues and project workflows through the Super Admin connector.", capabilities: ["Repositories", "Issues", "Development"], route: "/admin?section=service-connectors", access: "admin", provider: "GitHub" },
  { id: "coingecko", name: "CoinGecko", category: "Finance", description: "Configure verified market-data credentials for supported CoinGecko endpoints.", capabilities: ["Crypto market data", "Demo / Pro key"], route: "/admin?section=service-connectors", access: "admin", provider: "CoinGecko" },
  { id: "chartgpt", name: "ChartGPT", category: "Work", description: "Generate charts from prompts and your structured data using the shared administrator-tested ChartGPT connection. Export your results; chart history is not retained by ChartGPT.", capabilities: ["Chart generation", "SVG / PNG / JSON export"], route: "/dashboard/charts", access: "info", provider: "ChartGPT" },
  { id: "notion", name: "Notion", category: "Work", description: "Add a Notion integration credential for the workspace. Actual actions depend on the connected Notion API and granted permissions.", capabilities: ["Knowledge workspace", "Pages and databases"], route: "/admin?section=service-connectors", access: "admin", provider: "Notion" },
  { id: "agentic", name: "Agentic AI directory", category: "AI", description: "Search the Agentic.ai public directory for compatible AI agents and services.", capabilities: ["Agent discovery", "Directory search"], route: "/admin?section=service-connectors", access: "admin", provider: "Agentic.ai" },
  { id: "paystack", name: "Paystack", category: "Finance", description: "Workspace-managed payment integration. Demo and Live modes remain separate and Live requires verified credentials and explicit activation.", capabilities: ["Checkout", "Transaction verification", "Webhooks"], route: "/dashboard/billing", access: "billing", provider: "Paystack", externalUrl: "https://paystack.com/docs" },
  { id: "render", name: "Render deployments", category: "Infrastructure", description: "Inspect Render services and deployment status from the protected deployment workplace.", capabilities: ["Deployments", "Service status", "Logs"], route: "/dashboard/deployments", access: "admin", provider: "Render", externalUrl: "https://render.com/docs" },
  { id: "neon", name: "Neon database", category: "Infrastructure", description: "The BALMZ AI application database is managed through Neon. Database administration remains protected.", capabilities: ["PostgreSQL", "Branch-aware migrations"], route: "/admin?section=storage", access: "admin", provider: "Neon", externalUrl: "https://neon.tech/docs" },
  { id: "mcp", name: "MCP tool endpoint", category: "Developer", description: "BALMZ AI exposes an MCP endpoint for compatible clients. Only tools registered by the server are callable.", capabilities: ["MCP", "Structured tool contracts"], route: "/mcp", access: "info", provider: "BALMZ AI" },
];

const categories = ["All", "AI", "Work", "Developer", "Finance", "Infrastructure"] as const;

export function PluginWorkspace({ isAdmin, planName }: { isAdmin: boolean; planName: string | null }) {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => plugins.filter((plugin) =>
    (category === "All" || plugin.category === category) &&
    (plugin.name + " " + plugin.description + " " + plugin.capabilities.join(" ")).toLowerCase().includes(search.trim().toLowerCase())
  ), [category, search]);

  return (
    <main className="min-h-[100dvh] bg-[#080c14] pb-12 text-slate-100">
      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <Link href="/dashboard" aria-label="Back to chat" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-xl text-slate-300 hover:bg-white/5">←</Link>
        <div className="text-center"><p className="text-sm font-semibold text-white">Plugins</p><p className="text-[10px] text-slate-500">BALMZ AI tool directory</p></div>
        <Link href="/dashboard/settings" aria-label="Open profile settings" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0b111c]"><Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={32} height={32} className="h-8 w-8 rounded-full object-contain" /></Link>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-10">
        <div className="max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--balmz-orange)]">Explore tools</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Extend your workspace.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Discover the AI providers and service integrations supported by BALMZ AI. Connections are verified before credentials are saved; availability depends on the configured provider, permissions and account plan.</p>
        </div>

        <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-2xl border border-white/[0.09] bg-[#111a28] px-4">
            <span className="text-lg text-slate-500">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search plugins and connectors" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-xs font-medium transition ${category === item ? "border-[var(--balmz-orange)]/30 bg-[var(--balmz-orange)]/10 text-[var(--balmz-orange)]" : "border-white/[0.08] bg-white/[0.025] text-slate-400 hover:text-white"}`}>{item}</button>)}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-slate-400">{filtered.length} plugin{filtered.length === 1 ? "" : "s"}</p>
          <p className="text-[10px] text-slate-600">{planName ? `Current plan · ${planName}` : "No active BALMZ AI plan"}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((plugin) => (
            <article key={plugin.id} className="flex min-h-[238px] flex-col rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 transition hover:border-white/[0.16]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.08] text-xs font-bold text-[var(--balmz-orange)]">{plugin.provider.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-white">{plugin.name}</h2><p className="mt-1 text-[10px] text-slate-500">{plugin.category} · {plugin.provider}</p></div>
              </div>
              <p className="mt-4 flex-1 text-xs leading-6 text-slate-400">{plugin.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{plugin.capabilities.map((capability) => <span key={capability} className="rounded-lg bg-white/[0.045] px-2 py-1 text-[9px] text-slate-400">{capability}</span>)}</div>
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.07] pt-4">
                <span className="text-[10px] text-slate-500">{plugin.access === "admin" ? "Admin-managed" : plugin.access === "billing" ? "Billing workspace" : "Workspace feature"}</span>
                <div className="flex items-center gap-2">
                  {plugin.externalUrl ? <button type="button" onClick={() => void openNativeBrowser(plugin.externalUrl!).catch(() => showNativeToast("Could not open the provider website."))} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-400 hover:text-white">Docs</button> : null}
                  {plugin.access === "admin" && !isAdmin
                    ? <span className="rounded-lg border border-white/[0.08] px-3 py-2 text-[10px] text-slate-500">Ask administrator</span>
                    : <Link href={plugin.route} className="rounded-lg bg-[var(--balmz-orange)] px-3 py-2 text-[10px] font-semibold text-[#17100a] transition hover:brightness-110">{plugin.access === "admin" ? "Manage" : plugin.access === "billing" ? "Open" : "Open tool"}</Link>}
                </div>
              </div>
            </article>
          ))}
        </div>

        {!filtered.length ? <div className="mt-5 rounded-2xl border border-white/[0.08] p-10 text-center text-sm text-slate-500">No matching plugins. Try another search.</div> : null}

        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
          <p className="text-sm font-semibold text-white">How plugin connections work</p>
          <p className="mt-2 text-xs leading-6 text-slate-400">BALMZ AI uses explicit tool registrations and server-side connectors. A directory listing is not proof that a service is connected. Admin-managed integrations must pass their connection test before they become usable; external credentials are never sent to the browser as plain text.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/dashboard/billing" className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5">Plans and billing</Link>
            {isAdmin ? <><Link href="/admin?section=ai-connections" className="rounded-xl border border-[var(--balmz-orange)]/30 px-4 py-2.5 text-xs text-[var(--balmz-orange)] hover:bg-[var(--balmz-orange)]/10">Manage AI providers</Link><Link href="/admin?section=service-connectors" className="rounded-xl border border-[var(--balmz-orange)]/30 px-4 py-2.5 text-xs text-[var(--balmz-orange)] hover:bg-[var(--balmz-orange)]/10">Manage service connectors</Link></> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
