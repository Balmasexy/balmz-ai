"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/app/components/sign-out-button";

type Message = { id: string; role: "user" | "assistant"; content: string; createdAt: string };
type Conversation = { id: string; title: string; updatedAt: string; messages: Message[] };
type ModelOption = { value: string; label: string; provider: string; modelId: string };

const STORAGE_KEY = "balmz-ai-client-workplace-v1";
const starterPrompts = [
  { title: "Write something", detail: "Draft an email, proposal or post", prompt: "Help me draft a clear, professional email about " },
  { title: "Learn something", detail: "Explain a topic step by step", prompt: "Explain this topic step by step, with practical examples: " },
  { title: "Build something", detail: "Plan or debug a project", prompt: "Help me plan and build this project: " },
  { title: "Explore an idea", detail: "Research options and trade-offs", prompt: "Help me explore this idea, including options and trade-offs: " },
];

function makeConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "New chat", updatedAt: new Date().toISOString(), messages: [] };
}

function shortTitle(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? cleaned.slice(0, 39) + "…" : cleaned || "New chat";
}

function Icon({ name }: { name: "new" | "search" | "chat" | "code" | "book" | "close" | "send" | "menu" | "copy" }) {
  const paths: Record<string, string> = {
    new: "M12 5v14m-7-7h14",
    search: "m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z",
    chat: "M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z",
    code: "m8 8-4 4 4 4m8-8 4 4-4 4m-3-10-2 12",
    book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21",
    close: "M18 6 6 18M6 6l12 12",
    send: "M22 2 11 13m11-11-7 20-4-9-9-4 20-7Z",
    menu: "M4 6h16M4 12h16M4 18h16",
    copy: "M8 8h12v12H8zM4 16V4h12",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]"><path d={paths[name]} /></svg>;
}

export function ClientWorkplace({ userName, userEmail, isAdmin, planName }: { userName: string; userEmail: string; isAdmin: boolean; planName: string | null }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [copied, setCopied] = useState("");
  const [model, setModel] = useState("env:gpt-4.1-mini");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [planCheck, setPlanCheck] = useState<"checking" | "active" | "inactive" | "unavailable">("checking");
  const [currentPlanName, setCurrentPlanName] = useState(planName);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) as Conversation[] : [];
      if (Array.isArray(saved)) {
        setConversations(saved);
        if (saved[0]?.id) setActiveId(saved[0].id);
        else {
          const first = makeConversation();
          setConversations([first]);
          setActiveId(first.id);
        }
      }
    } catch {
      const first = makeConversation();
      setConversations([first]);
      setActiveId(first.id);
    }
  }, []);

  useEffect(() => {
    if (conversations.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, conversations, busy]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { active?: boolean; subscription?: { plan_name?: string } | null; message?: string };
        if (!response.ok) throw new Error(result.message || "Subscription check failed.");
        if (cancelled) return;
        setPlanCheck(result.active ? "active" : "inactive");
        setCurrentPlanName(result.subscription?.plan_name ?? null);
      })
      .catch(() => { if (!cancelled) setPlanCheck("unavailable"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/models", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { models?: ModelOption[] };
        if (!response.ok || !Array.isArray(payload.models)) return;
        if (cancelled) return;
        setModelOptions(payload.models);
        setModel((current) => payload.models!.some((option) => option.value === current)
          ? current
          : payload.models![0]?.value ?? current);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const active = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [conversations, activeId]);
  const filtered = useMemo(() => conversations.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())), [conversations, query]);

  function newChat() {
    const item = makeConversation();
    setConversations((current) => [item, ...current]);
    setActiveId(item.id);
    setPrompt("");
    setNotice("");
    setMobileSidebar(false);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function updateMessages(id: string, messages: Message[]) {
    setConversations((current) => current.map((item) => item.id === id ? {
      ...item,
      messages,
      title: item.messages.length ? item.title : shortTitle(messages.find((message) => message.role === "user")?.content ?? ""),
      updatedAt: new Date().toISOString(),
    } : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function sendMessage(value = prompt) {
    const text = value.trim();
    if (!text || busy) return;
    if (planCheck !== "active") {
      setNotice(planCheck === "unavailable"
        ? "Your BALMZ AI plan could not be verified. No AI request was sent. Refresh the workspace and try again."
        : "An active BALMZ AI plan is required before sending AI requests. Choose a plan to continue.");
      return;
    }
    let conversation = active;
    if (!conversation) {
      conversation = makeConversation();
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text, createdAt: new Date().toISOString() };
    const next = [...conversation.messages, userMessage];
    updateMessages(conversation.id, next);
    setPrompt("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), model }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; error?: string; reply?: string };
      if (!response.ok || !payload.reply) {
        const message = payload.message || (response.status === 402
          ? "AI chat requires an active subscription with an ai_messages allowance."
          : response.status === 503
            ? "AI chat is not configured yet. The workspace is ready, but the server-side provider key or plan allowance is missing."
            : "The assistant could not complete this request. Please try again.");
        setNotice(message);
        return;
      }
      updateMessages(conversation.id, [...next, { id: crypto.randomUUID(), role: "assistant", content: payload.reply, createdAt: new Date().toISOString() }]);
    } catch {
      setNotice("Could not reach BALMZ AI. Check your connection and try again.");
    } finally {
      setBusy(false);
      setMobileSidebar(false);
    }
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      window.setTimeout(() => setCopied(""), 1600);
    } catch {
      setNotice("Clipboard access is unavailable in this browser.");
    }
  }

  const hasMessages = Boolean(active?.messages.length);

  return (
    <main className="flex h-[100dvh] min-h-[560px] overflow-hidden bg-[#080c14] text-slate-100">
      {mobileSidebar ? <button aria-label="Close navigation" onClick={() => setMobileSidebar(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" /> : null}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[286px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0b111c] transition-transform duration-200 lg:static lg:translate-x-0 ${mobileSidebar ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--balmz-orange)] text-sm font-black text-[#17100a]">W</span>
            <span><span className="block text-sm font-bold tracking-[0.16em] text-white">BALMZ AI</span><span className="block text-[10px] text-slate-500">Your AI workplace</span></span>
          </Link>
          <button onClick={() => setMobileSidebar(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Close sidebar"><Icon name="close" /></button>
        </div>
        <div className="p-3">
          <button onClick={newChat} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-medium text-slate-100 transition hover:border-[var(--balmz-orange)]/50 hover:bg-white/[0.07]">
            <span className="text-[var(--balmz-orange)]"><Icon name="new" /></span> New chat <span className="ml-auto text-[10px] text-slate-500">⌘ K</span>
          </button>
          <label className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5 text-slate-500 focus-within:ring-1 focus-within:ring-[var(--balmz-orange)]">
            <Icon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Recent</p>
          {filtered.length ? <div className="space-y-1">{filtered.map((item) => <button key={item.id} onClick={() => { setActiveId(item.id); setMobileSidebar(false); setNotice(""); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition ${activeId === item.id ? "bg-[var(--balmz-orange)]/10 text-white" : "text-slate-400 hover:bg-white/[0.045] hover:text-slate-200"}`}><span className={activeId === item.id ? "text-[var(--balmz-orange)]" : "text-slate-600"}><Icon name="chat" /></span><span className="truncate">{item.title}</span></button>)}</div> : <p className="px-3 py-4 text-xs text-slate-600">No matching chats</p>}
          <p className="px-2 pb-2 pt-7 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Explore</p>
          <div className="space-y-1">
            <Link href="/dashboard/plugins" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">⌘ Plugins and connectors</Link>
            <Link href="/dashboard/charts" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">▥ ChartGPT workspace</Link>
            <Link href="/dashboard/usage" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">▤ Usage and limits</Link>
            <Link href="/dashboard/billing" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">₦ Plans & billing</Link>
            {isAdmin ? <>
              <Link href="/dashboard/deployments" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]"><Icon name="code" /> Deployment workplace</Link>
              <Link href="/admin?section=terminal" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">›_ Admin terminal</Link>
              <Link href="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs text-slate-400 hover:bg-white/[0.045]">♙ Super Admin</Link>
            </> : null}
          </div>
        </div>
        <div className="border-t border-white/[0.07] p-3">
          <Link href="/dashboard/settings" className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.045]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--balmz-orange)]/15 text-sm font-semibold text-[var(--balmz-orange)]">{userName.trim().slice(0, 1).toUpperCase() || "U"}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{userName}</span><span className="block truncate text-[10px] text-slate-500">{currentPlanName || "No active plan"} · Settings</span></span>
            <span className="text-slate-500">›</span>
          </Link>
          <div className="flex items-center justify-between px-2"><span className="truncate text-[10px] text-slate-600">{userEmail}</span><SignOutButton /></div>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.07] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebar(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open navigation"><Icon name="menu" /></button>
            <div><p className="text-sm font-semibold text-white">Chat</p><p className="hidden text-[10px] text-slate-500 sm:block">A focused space for your ideas and work</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/plugins" className="hidden rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white sm:inline-flex">Plugins</Link>
            <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-slate-500">Model <select value={model} onChange={(event) => setModel(event.target.value)} className="max-w-[140px] bg-transparent text-xs font-medium text-slate-200 outline-none">{modelOptions.length ? modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : <option value={model}>No providers connected</option>}</select></label>
            <Link href="/dashboard/settings" aria-label="Open profile settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--balmz-orange)]/15 text-xs font-bold text-[var(--balmz-orange)]">{userName.trim().slice(0, 1).toUpperCase() || "B"}</Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {planCheck !== "active" && planCheck !== "checking" ? <div className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--balmz-orange)]/20 bg-[var(--balmz-orange)]/[0.07] px-4 py-3">
            <p className="text-xs leading-5 text-slate-200">{planCheck === "unavailable" ? "We could not verify your plan. AI requests are paused until your plan status can be checked." : "An active BALMZ AI plan is required before sending AI requests."}</p>
            <Link href="/dashboard/billing" className="shrink-0 rounded-lg bg-[var(--balmz-orange)] px-3 py-2 text-[10px] font-semibold text-[#17100a]">View plans</Link>
          </div> : null}
          {!hasMessages ? <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-8">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--balmz-orange)] text-lg font-black text-[#17100a] shadow-[0_0_38px_rgba(255,105,0,0.18)]">W</div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">What can I help you with?</h1>
              <p className="mt-3 text-sm leading-6 text-slate-500">Ask a question, develop an idea, or continue your work.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {starterPrompts.map((item) => <button key={item.title} onClick={() => { setPrompt(item.prompt); textareaRef.current?.focus(); }} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-[var(--balmz-orange)]/35 hover:bg-white/[0.045]"><span className="block text-sm font-medium text-slate-200">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></button>)}
            </div>
            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-3 shadow-2xl shadow-black/20">
              <textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={3} placeholder="Message BALMZ AI…" className="max-h-44 min-h-[72px] w-full resize-y bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600" />
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                <span className="text-[10px] text-slate-600">Enter to send · Shift + Enter for a new line</span>
                <button onClick={() => void sendMessage()} disabled={!prompt.trim() || busy || planCheck !== "active"} className="flex h-9 items-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="send" /> Send</button>
              </div>
            </div>
            <p className="mt-4 text-center text-[10px] text-slate-600">AI responses require an active plan and a connected provider. Switch models from the selector when more providers are available.</p>
          </div> : <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
            <div className="space-y-8">{active?.messages.map((message) => <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex gap-3"}>
              {message.role === "assistant" ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--balmz-orange)] text-xs font-black text-[#17100a]">W</span> : null}
              <div className={message.role === "user" ? "max-w-[88%] rounded-3xl bg-[#182232] px-5 py-3.5 text-sm leading-7 text-slate-100" : "min-w-0 flex-1 pt-1 text-sm leading-7 text-slate-200"}>
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                {message.role === "assistant" ? <button onClick={() => void copyMessage(message)} className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-300"><Icon name="copy" /> {copied === message.id ? "Copied" : "Copy"}</button> : null}
              </div>
            </article>)}
              {busy ? <div className="flex items-center gap-3 text-xs text-slate-500"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--balmz-orange)] text-xs font-black text-[#17100a]">W</span><span className="animate-pulse">BALMZ AI is thinking…</span></div> : null}
            </div>
            <div ref={bottomRef} />
          </div>}
          {notice ? <div role="alert" className="mx-auto mb-4 w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs leading-5 text-amber-100">{notice}</div> : null}
        </div>

        {hasMessages ? <div className="shrink-0 px-4 pb-4 sm:px-8 sm:pb-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.09] bg-[#0d1420] p-3 shadow-2xl shadow-black/20 focus-within:border-[var(--balmz-orange)]/35">
            <textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} rows={2} placeholder="Message BALMZ AI…" className="max-h-40 min-h-[52px] w-full resize-y bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600" />
            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
              <span className="text-[10px] text-slate-600">Shift + Enter for a new line</span>
              <button onClick={() => void sendMessage()} disabled={!prompt.trim() || busy || planCheck !== "active"} className="flex h-9 items-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="send" /> Send</button>
            </div>
          </div>
        </div> : null}
      </section>
    </main>
  );
}
