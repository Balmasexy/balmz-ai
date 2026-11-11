"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode, KeyboardEvent } from "react";
import Link from "next/link";
import { SignOutButton } from "@/app/components/sign-out-button";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
};

type WorkspaceProps = {
  userName: string;
  userEmail: string;
  isAdmin: boolean;
  planName: string | null;
};

const starterPrompts = [
  { title: "Write something", detail: "Draft an email, proposal or post", prompt: "Help me draft a clear, professional email about " },
  { title: "Learn something", detail: "Explain a topic step by step", prompt: "Explain this topic step by step, with practical examples: " },
  { title: "Build something", detail: "Plan or debug a project", prompt: "Help me plan and build this project: " },
  { title: "Explore an idea", detail: "Research options and trade-offs", prompt: "Help me explore this idea, including options and trade-offs: " },
];

function makeId(): string {
  return crypto.randomUUID();
}

function shortTitle(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > 42 ? cleaned.slice(0, 39) + "…" : cleaned || "New chat";
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function Icon({ name }: { name: "new" | "search" | "chat" | "code" | "book" | "close" | "send" | "menu" | "copy" | "trash" | "stop" }) {
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
    trash: "M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 4v5m6-5v5",
    stop: "M7 7h10v10H7z",
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d={paths[name]} />
    </svg>
  );
}

function inlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\`[^\`]+\`|\*[^*]+\*)/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={index} className="font-semibold text-slate-50">{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={index} className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.92em] text-orange-200">{token.slice(1, -1)}</code>;
    }
    if (token.startsWith("*") && token.endsWith("*")) {
      return <em key={index}>{token.slice(1, -1)}</em>;
    }
    return <span key={index}>{token}</span>;
  });
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let blockIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={blockIndex++} className="mb-3 last:mb-0">{paragraph.map((line) => inlineMarkdown(line)).reduce<ReactNode[]>((all, part, index) => index === 0 ? part : [...all, " ", ...part], [])}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blockIndex++} className="mb-3 list-disc space-y-1 pl-6 last:mb-0">
        {list.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}
      </ul>,
    );
    list = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        blocks.push(<pre key={blockIndex++} className="mb-4 overflow-x-auto rounded-xl border border-white/10 bg-[#060a11] p-4 text-xs leading-6 text-slate-200"><code>{codeLines.join("\n")}</code></pre>);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h3 key={blockIndex++} className="mb-2 mt-4 font-semibold text-slate-50">{inlineMarkdown(heading[2])}</h3>);
      continue;
    }
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  if (inCode) {
    blocks.push(<pre key={blockIndex++} className="mb-4 overflow-x-auto rounded-xl border border-white/10 bg-[#060a11] p-4 text-xs leading-6 text-slate-200"><code>{codeLines.join("\n")}</code></pre>);
  }
  flushParagraph();
  flushList();

  return <div className="break-words">{blocks}</div>;
}

export function ClientWorkplace({ userName, userEmail, isAdmin, planName }: WorkspaceProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [copied, setCopied] = useState("");
  const [notice, setNotice] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const active = useMemo(
    () => conversations.find((item) => item.id === activeId) ?? null,
    [conversations, activeId],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? conversations.filter((item) => item.title.toLowerCase().includes(term)) : conversations;
  }, [conversations, query]);
  const hasMessages = messages.length > 0;

  const loadConversations = useCallback(async () => {
    const response = await fetch("/api/ai/conversations", { cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(data.message || "Saved conversations could not be loaded.");
    }
    const data = await response.json() as { conversations?: Conversation[] };
    const items = Array.isArray(data.conversations) ? data.conversations : [];
    setConversations(items);
    return items;
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), { cache: "no-store" });
    if (!response.ok) throw new Error("This conversation could not be loaded.");
    const data = await response.json() as { messages?: Message[] };
    setMessages(Array.isArray(data.messages) ? data.messages : []);
  }, []);

  useEffect(() => {
    let activeEffect = true;
    async function initialize() {
      setHistoryLoading(true);
      try {
        const items = await loadConversations();
        if (!activeEffect) return;
        if (items[0]) {
          setActiveId(items[0].id);
          await loadConversation(items[0].id);
        }
      } catch (error) {
        if (activeEffect) setNotice(error instanceof Error ? error.message : "Saved conversations could not be loaded.");
      } finally {
        if (activeEffect) setHistoryLoading(false);
      }
    }
    void initialize();
    return () => {
      activeEffect = false;
      abortRef.current?.abort();
    };
  }, [loadConversations, loadConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    function onShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        startNewChat();
      }
    }
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  });

  function startNewChat() {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setPrompt("");
    setNotice("");
    setMobileSidebar(false);
    window.setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function selectConversation(id: string) {
    if (busy) abortRef.current?.abort();
    setActiveId(id);
    setMessages([]);
    setNotice("");
    setMobileSidebar(false);
    try {
      await loadConversation(id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This conversation could not be loaded.");
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm("Delete this conversation and its messages? This cannot be undone.")) return;
    try {
      const response = await fetch("/api/ai/conversations/" + encodeURIComponent(id), { method: "DELETE" });
      if (!response.ok) throw new Error("This conversation could not be deleted.");
      const remaining = conversations.filter((item) => item.id !== id);
      setConversations(remaining);
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This conversation could not be deleted.");
    }
  }

  async function sendMessage(value = prompt) {
    const text = value.trim();
    if (!text || busy) return;

    const userMessage: Message = {
      id: makeId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: Message = {
      id: "pending-" + makeId(),
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setPrompt("");
    setNotice("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantText = "";

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ message: text, conversationId: activeId, model }),
        signal: controller.signal,
      });

      const returnedId = response.headers.get("x-balmz-conversation-id");
      if (returnedId) setActiveId(returnedId);

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(data.message || "The assistant could not complete this request.");
      }
      if (!response.body) throw new Error("The assistant response stream is unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError = "";

      const consumeLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as { type?: string; text?: string; message?: string };
          if (event.type === "delta" && typeof event.text === "string") {
            assistantText += event.text;
            setMessages((current) => current.map((item) => item.id === assistantMessage.id ? { ...item, content: assistantText } : item));
          }
          if (event.type === "error") streamError = event.message || "The response could not be completed.";
        } catch {
          // Ignore malformed stream records.
        }
      };

      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) consumeLine(line);
        if (chunk.done) break;
      }
      if (buffer.trim()) consumeLine(buffer);

      if (streamError) throw new Error(streamError);
      if (!assistantText.trim()) throw new Error("The assistant returned an empty response.");
      setMessages((current) => current.map((item) => item.id === assistantMessage.id ? { ...item, content: assistantText } : item));
      const items = await loadConversations();
      if (returnedId && !items.some((item) => item.id === returnedId)) {
        setConversations((current) => [{ id: returnedId, title: shortTitle(text), updatedAt: new Date().toISOString() }, ...current]);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (assistantText) {
          setMessages((current) => current.map((item) => item.id === assistantMessage.id ? { ...item, content: assistantText + "\n\n_Response stopped._" } : item));
        } else {
          setMessages((current) => current.filter((item) => item.id !== assistantMessage.id));
        }
        setNotice("Response stopped.");
      } else {
        setMessages((current) => current.filter((item) => item.id !== assistantMessage.id));
        setNotice(error instanceof Error ? error.message : "The assistant could not complete this request.");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setMobileSidebar(false);
      textareaRef.current?.focus();
      void loadConversations().catch(() => undefined);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
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

  const sidebar = (
    <div className="flex h-full flex-col bg-[#0b111c]">
      <div className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-4">
        <Link href="/" className="flex items-center gap-3">
          <img src="/balmz-logo.svg" alt="" className="h-9 w-9 rounded-xl" />
          <span><span className="block text-sm font-bold tracking-[0.16em] text-white">BALMZ AI</span><span className="block text-[10px] text-slate-500">Your AI workplace</span></span>
        </Link>
        <button onClick={() => setMobileSidebar(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Close sidebar"><Icon name="close" /></button>
      </div>
      <div className="p-3">
        <button onClick={startNewChat} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm font-medium text-slate-100 transition hover:border-[var(--balmz-orange)]/50 hover:bg-white/[0.07]">
          <span className="text-[var(--balmz-orange)]"><Icon name="new" /></span> New chat <span className="ml-auto text-[10px] text-slate-500">⌘ K</span>
        </button>
        <label className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5 text-slate-500 focus-within:ring-1 focus-within:ring-[var(--balmz-orange)]">
          <Icon name="search" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="flex items-center justify-between px-2 pb-2 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Recent</p>
          {historyLoading ? <span className="text-[10px] text-slate-600">Loading</span> : null}
        </div>
        {filtered.length ? (
          <div className="space-y-1">
            {filtered.map((item) => (
              <div key={item.id} className={"group flex items-center gap-1 rounded-lg " + (activeId === item.id ? "bg-[var(--balmz-orange)]/10" : "hover:bg-white/[0.045]")}>
                <button type="button" disabled={busy} onClick={() => void selectConversation(item.id)} className={"flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-xs " + (activeId === item.id ? "text-white" : "text-slate-400 hover:text-slate-200")}>
                  <span className={activeId === item.id ? "text-[var(--balmz-orange)]" : "text-slate-600"}><Icon name="chat" /></span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </button>
                <button type="button" disabled={busy} onClick={() => void deleteConversation(item.id)} className="mr-1 rounded-md p-2 text-slate-600 opacity-0 transition hover:bg-white/10 hover:text-rose-300 group-hover:opacity-100 focus:opacity-100" aria-label={"Delete " + item.title}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        ) : <p className="px-3 py-4 text-xs text-slate-600">{query ? "No matching chats" : "Your saved conversations will appear here."}</p>}
      </div>
      <div className="border-t border-white/[0.07] p-3">
        <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--balmz-orange)]/15 text-sm font-semibold text-[var(--balmz-orange)]">{userName.trim().slice(0, 1).toUpperCase() || "U"}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-200">{userName}</span><span className="block truncate text-[10px] text-slate-500">{planName || "No plan assigned"}</span></span>
        </div>
        <div className="flex items-center justify-between px-2"><span className="truncate text-[10px] text-slate-600">{userEmail}</span><SignOutButton /></div>
        {isAdmin ? <Link href="/dashboard/deployments" className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.045] hover:text-white"><Icon name="code" /> Deployment workplace</Link> : null}
        {isAdmin ? <Link href="/admin" className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-white/[0.045] hover:text-white">♙ Super Admin</Link> : null}
      </div>
    </div>
  );

  return (
    <main id="workspace" className="flex h-[100dvh] min-h-[560px] overflow-hidden bg-[#080c14] text-slate-100">
      {mobileSidebar ? <button aria-label="Close navigation" onClick={() => setMobileSidebar(false)} className="fixed inset-0 z-30 bg-black/60 lg:hidden" /> : null}
      <aside className={"fixed inset-y-0 left-0 z-40 flex w-[286px] shrink-0 flex-col border-r border-white/[0.08] transition-transform duration-200 lg:static lg:translate-x-0 " + (mobileSidebar ? "translate-x-0" : "-translate-x-full")}>
        {sidebar}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-white/[0.07] px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileSidebar(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open navigation"><Icon name="menu" /></button>
            <div><p className="text-sm font-semibold text-white">{active?.title || "New chat"}</p><p className="hidden text-[10px] text-slate-500 sm:block">A focused space for your ideas and work</p></div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] text-slate-500">Model <select value={model} onChange={(event) => setModel(event.target.value)} className="max-w-[118px] bg-transparent text-xs font-medium text-slate-200 outline-none"><option value="gpt-4.1-mini">GPT-4.1 mini</option><option value="gpt-4.1">GPT-4.1</option></select></label>
            <span className="h-2 w-2 rounded-full bg-slate-500" title="Client workspace loaded" />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {!hasMessages ? (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10 sm:px-8">
              <div className="mx-auto mb-8 max-w-2xl text-center">
                <img src="/balmz-logo.svg" alt="BALMZ AI" className="mx-auto mb-5 h-12 w-12 rounded-2xl shadow-[0_0_38px_rgba(255,105,0,0.18)]" />
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">What can I help you with?</h1>
                <p className="mt-3 text-sm leading-6 text-slate-500">Ask a question, develop an idea, or continue your work.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {starterPrompts.map((item) => <button key={item.title} onClick={() => { setPrompt(item.prompt); textareaRef.current?.focus(); }} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 text-left transition hover:border-[var(--balmz-orange)]/35 hover:bg-white/[0.045]"><span className="block text-sm font-medium text-slate-200">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></button>)}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
              <div className="space-y-8">
                {messages.map((message) => (
                  <article key={message.id} className={message.role === "user" ? "flex justify-end" : "flex gap-3"}>
                    {message.role === "assistant" ? <img src="/balmz-logo.svg" alt="BALMZ AI" className="h-8 w-8 shrink-0 rounded-lg" /> : null}
                    <div className={message.role === "user" ? "max-w-[88%] rounded-3xl bg-[#182232] px-5 py-3.5 text-sm leading-7 text-slate-100" : "min-w-0 flex-1 pt-1 text-sm leading-7 text-slate-200"}>
                      {message.role === "assistant" ? <MarkdownContent content={message.content} /> : <div className="whitespace-pre-wrap break-words">{message.content}</div>}
                      {message.role === "assistant" && message.content ? <button onClick={() => void copyMessage(message)} className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-slate-300"><Icon name="copy" /> {copied === message.id ? "Copied" : "Copy"}</button> : null}
                    </div>
                  </article>
                ))}
                {busy ? <div className="flex items-center gap-3 text-xs text-slate-500"><img src="/balmz-logo.svg" alt="" className="h-8 w-8 rounded-lg" /><span className="animate-pulse">BALMZ AI is thinking…</span></div> : null}
              </div>
              <div ref={bottomRef} />
            </div>
          )}
          {notice ? <div role="alert" className="mx-auto mb-4 w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs leading-5 text-amber-100">{notice}</div> : null}
        </div>

        <div className="shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 sm:px-8 sm:pb-6">
          <form onSubmit={submit} className="mx-auto max-w-3xl rounded-2xl border border-white/[0.09] bg-[#0d1420] p-3 shadow-2xl shadow-black/20 focus-within:border-[var(--balmz-orange)]/50">
            <textarea ref={textareaRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handleComposerKeyDown} rows={2} maxLength={12000} placeholder="Message BALMZ AI…" aria-label="Message BALMZ AI" className="max-h-40 min-h-[52px] w-full resize-y bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600" />
            <div className="flex items-center justify-between border-t border-white/[0.06] pt-2">
              <span className="text-[10px] text-slate-600">Enter to send · Shift + Enter for a new line</span>
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="flex h-9 items-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110"><Icon name="stop" /> Stop</button>
              ) : (
                <button type="submit" disabled={!prompt.trim()} className="flex h-9 items-center gap-2 rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Icon name="send" /> Send</button>
              )}
            </div>
          </form>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] leading-4 text-slate-600">AI responses require an active plan and configured provider key. Verify important information.</p>
        </div>
      </section>
    </main>
  );
}
