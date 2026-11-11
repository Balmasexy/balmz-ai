"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { SignOutButton } from "@/app/components/sign-out-button";

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type ChatStatus = {
  enabled: boolean;
  model: string | null;
  message: string | null;
};

type WorkspaceProps = {
  userName: string;
  userEmail: string;
  isAdmin: boolean;
};

const quickPrompts = [
  { title: "Write", subtitle: "Draft an email, post or document", prompt: "Help me draft a clear, professional document. Ask me for any missing details." },
  { title: "Learn", subtitle: "Explain a topic step by step", prompt: "Teach me a topic step by step, with a simple explanation and practical examples." },
  { title: "Code", subtitle: "Debug or build something", prompt: "Help me plan and build a software feature. Start by clarifying the requirements and then give me working code." },
  { title: "Research", subtitle: "Organize ideas and evidence", prompt: "Help me structure a research brief, identify what evidence is needed, and separate verified facts from assumptions." },
];

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "B";
}

function parseEvent(line: string): Record<string, unknown> | null {
  if (!line.startsWith("{")) return null;
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function Icon({
  name,
  size = 18,
}: {
  name: "menu" | "plus" | "search" | "edit" | "trash" | "send" | "stop" | "chevron" | "spark" | "close";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "menu":
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case "plus":
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "search":
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></svg>;
    case "edit":
      return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>;
    case "trash":
      return <svg {...common}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></svg>;
    case "send":
      return <svg {...common}><path d="m4 4 16 8-16 8 3-8-3-8Z" /><path d="M7 12h13" /></svg>;
    case "stop":
      return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m7 10 5 5 5-5" /></svg>;
    case "spark":
      return <svg {...common}><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></svg>;
    case "close":
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  }
}

export function WorkspaceClient({ userName, userEmail, isAdmin }: WorkspaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) ?? null,
    [conversations, conversationId],
  );

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => item.title.toLowerCase().includes(query));
  }, [conversations, search]);

  const loadConversations = useCallback(async (selectLatest = false) => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/workspace/conversations", {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        setStorageReady(false);
        return;
      }
      const data = await response.json() as { conversations?: Conversation[] };
      const items = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(items);
      setStorageReady(true);
      if (selectLatest && items[0]) {
        setConversationId(items[0].id);
      }
    } catch {
      setStorageReady(false);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [statusResponse, conversationsResponse] = await Promise.all([
          fetch("/api/workspace/status", { cache: "no-store" }),
          fetch("/api/workspace/conversations", { cache: "no-store" }),
        ]);
        if (!active) return;
        if (statusResponse.ok) {
          const statusData = await statusResponse.json() as ChatStatus;
          setStatus(statusData);
        } else {
          setStatus({ enabled: false, model: null, message: "Your AI session could not be verified. Refresh and sign in again." });
        }
        if (conversationsResponse.ok) {
          const data = await conversationsResponse.json() as { conversations?: Conversation[] };
          const items = Array.isArray(data.conversations) ? data.conversations : [];
          setConversations(items);
          setStorageReady(true);
          if (items[0]) setConversationId(items[0].id);
        } else {
          setStorageReady(false);
        }
      } catch {
        if (active) {
          setStorageReady(false);
          setStatus({ enabled: false, model: null, message: "BALMZ AI could not connect. Check your connection and try again." });
        }
      } finally {
        if (active) setHistoryLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    if (sending) return;
    let active = true;
    async function loadMessages() {
      try {
        const response = await fetch("/api/workspace/conversations/" + encodeURIComponent(conversationId as string), {
          cache: "no-store",
        });
        if (!response.ok) {
          if (active) setNotice("Unable to load this conversation. Refresh the history and try again.");
          return;
        }
        const data = await response.json() as { messages?: ChatMessage[] };
        if (active) {
          setMessages(Array.isArray(data.messages) ? data.messages : []);
          setNotice("");
        }
      } catch {
        if (active) setNotice("Unable to load this conversation. Check your connection.");
      }
    }
    void loadMessages();
    return () => {
      active = false;
    };
  }, [conversationId, sending]);

  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: sending ? "auto" : "smooth" });
  }, [messages, sending]);

  const startNewChat = useCallback(() => {
    if (sending) abortRef.current?.abort();
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setNotice("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  }, [sending]);

  async function selectConversation(id: string) {
    if (sending) abortRef.current?.abort();
    setMessages([]);
    setConversationId(id);
    setNotice("");
    setSidebarOpen(false);
  }

  async function removeConversation(id: string) {
    const confirmed = window.confirm("Delete this conversation? This cannot be undone.");
    if (!confirmed) return;
    try {
      const response = await fetch("/api/workspace/conversations/" + encodeURIComponent(id), { method: "DELETE" });
      if (!response.ok) {
        setNotice("This conversation could not be deleted.");
        return;
      }
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      if (conversationId === id) {
        setConversationId(remaining[0]?.id ?? null);
        setMessages([]);
      }
    } catch {
      setNotice("This conversation could not be deleted. Check your connection.");
    }
  }

  async function sendText(rawText: string) {
    const text = rawText.trim();
    if (!text || sending) return;
    if (!status?.enabled || storageReady !== true) {
      setNotice(status?.message || "BALMZ AI is not ready to send messages yet.");
      return;
    }

    const userMessage: ChatMessage = {
      id: "user-" + crypto.randomUUID(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    const assistantId = "assistant-" + crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft("");
    setSending(true);
    setNotice("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/workspace/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ conversationId, message: text }),
        signal: controller.signal,
      });

      const returnedConversationId = response.headers.get("x-balmz-conversation-id");
      if (returnedConversationId) {
        setConversationId(returnedConversationId);
      }

      if (!response.ok) {
        let errorMessage = "BALMZ AI could not complete this response. Please try again.";
        try {
          const errorData = await response.json() as { message?: string };
          if (errorData.message) errorMessage = errorData.message;
        } catch {
          // Keep the safe fallback message.
        }
        setMessages((current) => current.map((item) =>
          item.id === assistantId ? { ...item, content: errorMessage } : item,
        ));
        setNotice(errorMessage);
        return;
      }

      if (!response.body) {
        throw new Error("The AI response stream was unavailable.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      const consumeLine = (line: string) => {
        const event = parseEvent(line.trim());
        if (!event) return;
        if (event.type === "delta" && typeof event.text === "string") {
          assistantText += event.text;
          setMessages((current) => current.map((item) =>
            item.id === assistantId ? { ...item, content: assistantText } : item,
          ));
        } else if (event.type === "error" && typeof event.message === "string") {
          setNotice(event.message);
          if (!assistantText) assistantText = event.message;
        }
      };

      while (true) {
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) consumeLine(line);
        if (part.done) break;
      }
      if (buffer.trim()) consumeLine(buffer);

      setMessages((current) => current.map((item) =>
        item.id === assistantId ? { ...item, content: assistantText || "The model returned an empty response. Please try again." } : item,
      ));
      await loadConversations(false);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setMessages((current) => current.map((item) =>
          item.id === assistantId && !item.content ? { ...item, content: "Response stopped." } : item,
        ));
      } else {
        const message = error instanceof Error ? error.message : "The connection was interrupted.";
        setMessages((current) => current.map((item) =>
          item.id === assistantId ? { ...item, content: message } : item,
        ));
        setNotice(message);
      }
    } finally {
      abortRef.current = null;
      setSending(false);
      void loadConversations(false);
      inputRef.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendText(draft);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendText(draft);
    }
  }

  const chatTitle = activeConversation?.title || "New chat";
  const modelLabel = status?.model || "AI assistant";
  const disabledReason = !storageReady
    ? "Saved chat storage is not ready. Apply the BALMZ AI workspace database migration to enable conversation history."
    : status?.message || "The AI provider is not configured for this workspace yet.";

  const sidebar = (
    <div className="flex h-full flex-col bg-[#101722]">
      <div className="flex items-center justify-between px-4 pb-5 pt-5">
        <a href="/" className="flex min-w-0 items-center gap-3">
          <img src="/balmz-logo.svg" alt="BALMZ AI" className="h-9 w-9 rounded-xl" />
          <span className="truncate text-sm font-bold tracking-[0.16em] text-white">BALMZ AI</span>
        </a>
        <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close menu">
          <Icon name="close" />
        </button>
      </div>

      <div className="px-3">
        <button type="button" onClick={startNewChat} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-[#190d06] transition hover:bg-orange-600">
          <Icon name="plus" size={17} />
          New chat
        </button>
        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0b111b] px-3 py-2.5 text-slate-400 focus-within:border-orange-500/60">
          <Icon name="search" size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500" />
          <span className="text-[10px] text-slate-600">⌘ K</span>
        </label>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent</p>
          {historyLoading ? <span className="text-[10px] text-slate-600">Loading</span> : null}
        </div>
        {filteredConversations.length ? (
          <div className="space-y-1">
            {filteredConversations.map((item) => (
              <div key={item.id} className={"group flex items-center gap-1 rounded-lg transition " + (item.id === conversationId ? "bg-white/[0.09]" : "hover:bg-white/[0.055]")}>
                <button type="button" onClick={() => void selectConversation(item.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                  <span className="block truncate text-[13px] text-slate-200">{item.title}</span>
                  <span className="mt-1 block text-[10px] text-slate-500">{shortDate(item.updated_at)}</span>
                </button>
                <button type="button" onClick={() => void removeConversation(item.id)} className="mr-1 rounded-md p-2 text-slate-600 opacity-0 transition hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100" aria-label={"Delete " + item.title}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-2 py-4 text-xs leading-5 text-slate-500">
            {search ? "No chats match your search." : "Your conversations will appear here."}
          </p>
        )}
      </div>

      <div className="border-t border-white/[0.08] p-3">
        {isAdmin ? (
          <a href="/admin" className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-orange-500/25 bg-orange-500/10 text-orange-500">⌘</span>
            Super Admin
          </a>
        ) : null}
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-[#190d06]">{initials(userName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">{userName}</span>
            <span className="mt-1 block truncate text-[10px] text-slate-500">{userEmail}</span>
          </span>
          <SignOutButton />
        </div>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#080c14] text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[278px] border-r border-white/[0.07] lg:block">
        {sidebar}
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-black/70" />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,310px)] border-r border-white/10 shadow-2xl">{sidebar}</aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:pl-[278px]">
        <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-white/[0.07] bg-[#080c14]/95 px-3 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 lg:hidden" aria-label="Open navigation">
              <Icon name="menu" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-white">BALMZ AI</span>
                <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 sm:inline-flex">{modelLabel}</span>
                <Icon name="chevron" size={14} />
              </div>
              <p className="truncate text-[10px] text-slate-500 sm:hidden">{chatTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] text-slate-400 sm:flex">
              <span className={"h-1.5 w-1.5 rounded-full " + (status?.enabled && storageReady ? "bg-emerald-400" : "bg-amber-400")} />
              {status?.enabled && storageReady ? "Connected" : "Setup required"}
            </span>
            <button type="button" onClick={startNewChat} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/[0.06]">
              <Icon name="edit" size={15} />
              <span className="hidden sm:inline">New chat</span>
            </button>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-[960px] flex-1 flex-col px-3 sm:px-6">
          <div ref={scrollRef} className="flex-1 overflow-y-auto pb-8 pt-6 sm:pt-9">
            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-[min(68vh,690px)] max-w-[760px] flex-col justify-center">
                <div className="mb-8 flex justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 shadow-[0_0_65px_rgba(255,105,0,0.11)]">
                    <img src="/balmz-logo.svg" alt="" className="h-10 w-10" />
                  </div>
                </div>
                <h1 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">What can I help you with?</h1>
                <p className="mx-auto mt-3 max-w-lg text-center text-sm leading-6 text-slate-400">Bring your ideas, research and everyday work into one focused AI workspace.</p>
                <div className="mt-9 grid gap-3 sm:grid-cols-2">
                  {quickPrompts.map((item) => (
                    <button key={item.title} type="button" onClick={() => void sendText(item.prompt)} className="rounded-2xl border border-white/[0.09] bg-[#0d1420] p-4 text-left transition hover:border-orange-500/40 hover:bg-[#111b29]">
                      <span className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-100">{item.title}</span>
                        <span className="text-orange-500"><Icon name="spark" size={16} /></span>
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-slate-500">{item.subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-[780px] space-y-8 pb-6">
                <div className="pb-2 text-center">
                  <p className="text-xs text-slate-500">{activeConversation?.title || "New conversation"}</p>
                </div>
                {messages.map((message) => (
                  <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex items-start gap-3 sm:gap-4"}>
                    {message.role === "assistant" ? (
                      <img src="/balmz-logo.svg" alt="BALMZ AI" className="mt-1 h-8 w-8 shrink-0 rounded-lg" />
                    ) : null}
                    <div className={message.role === "user" ? "max-w-[88%] rounded-[22px] rounded-br-md bg-[#1a2431] px-4 py-3 text-[14px] leading-7 text-slate-100 sm:max-w-[78%] sm:px-5" : "min-w-0 flex-1 pt-1 text-[14px] leading-7 text-slate-200"}>
                      <div className="whitespace-pre-wrap break-words">{message.content || (sending && message.role === "assistant" ? <span className="inline-flex items-center gap-2 text-slate-500"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />Thinking</span> : "")}</div>
                      {message.role === "assistant" && message.content ? (
                        <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-600">
                          <span>{shortDate(message.created_at)}</span>
                          <button type="button" onClick={() => void navigator.clipboard?.writeText(message.content)} className="rounded px-1.5 py-0.5 transition hover:bg-white/10 hover:text-slate-300">Copy</button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 bg-gradient-to-t from-[#080c14] via-[#080c14] to-transparent pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
            {notice ? (
              <div className="mx-auto mb-3 max-w-[780px] rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/80" role="status">
                {notice}
              </div>
            ) : null}
            {(!status?.enabled || storageReady !== true) && (
              <div className="mx-auto mb-3 max-w-[780px] rounded-xl border border-white/[0.08] bg-[#101722] px-4 py-3 text-xs leading-5 text-slate-400">
                {disabledReason}
              </div>
            )}
            <form onSubmit={submit} className="mx-auto max-w-[800px] rounded-[26px] border border-white/[0.12] bg-[#141d29] p-2 shadow-[0_12px_48px_rgba(0,0,0,0.35)] transition focus-within:border-orange-500/60">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                rows={1}
                maxLength={12000}
                disabled={!status?.enabled || storageReady !== true}
                placeholder="Message BALMZ AI"
                aria-label="Message BALMZ AI"
                className="max-h-44 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-[14px] leading-6 text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
              />
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <div className="flex items-center gap-2 pl-1">
                  <span className="hidden text-[10px] text-slate-600 sm:inline">Shift + Enter for a new line</span>
                </div>
                {sending ? (
                  <button type="button" onClick={() => abortRef.current?.abort()} className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-[#190d06] transition hover:bg-orange-600" aria-label="Stop response">
                    <Icon name="stop" size={17} />
                  </button>
                ) : (
                  <button type="submit" disabled={!draft.trim() || !status?.enabled || storageReady !== true} className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-[#190d06] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Send message">
                    <Icon name="send" size={17} />
                  </button>
                )}
              </div>
            </form>
            <p className="mx-auto mt-2 max-w-[800px] px-2 text-center text-[10px] leading-4 text-slate-600">BALMZ AI can make mistakes. Verify important information before acting on it.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
