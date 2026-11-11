"use client";

import { useEffect, useRef, useState } from "react";

type ModelOption = { value: string; label: string; provider: string; modelId: string };
type QuickMessage = { id: string; role: "user" | "assistant"; content: string };

export function QuickChatHelper({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [planActive, setPlanActive] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/ai/models", { cache: "no-store" }).then(async (response) => {
        const data = await response.json() as { models?: ModelOption[]; message?: string };
        if (!response.ok) throw new Error(data.message || "AI models could not be loaded.");
        return data;
      }),
      fetch("/api/subscription", { cache: "no-store" }).then(async (response) => {
        const data = await response.json() as { active?: boolean };
        if (!response.ok) throw new Error("Plan status could not be checked.");
        return data;
      }),
    ]).then(([modelData, planData]) => {
      if (cancelled) return;
      const available = modelData.models ?? [];
      setModels(available);
      setModel(available[0]?.value ?? "");
      setPlanActive(Boolean(planData.active));
      if (!available.length) setError(modelData.message || "No AI provider is connected yet.");
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Quick Chat is unavailable.");
    }).finally(() => {
      if (!cancelled) setModelsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [open, messages, loading]);

  async function send() {
    const content = draft.trim();
    if (!content || loading) return;
    if (!planActive) { setError("An active BALMZ AI plan is required to use Quick Chat."); return; }
    if (!model) { setError("No AI model is connected. Ask the Super Admin to connect and test a provider."); return; }
    const userMessage: QuickMessage = { id: crypto.randomUUID(), role: "user", content };
    const next = [...messages, userMessage].slice(-10);
    setMessages(next);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content: text }) => ({ role, content: text })), model }),
      });
      const payload = await response.json().catch(() => ({})) as { reply?: string; message?: string };
      if (!response.ok || !payload.reply) throw new Error(payload.message || "Quick Chat could not complete that request.");
      setMessages([...next, { id: crypto.randomUUID(), role: "assistant", content: payload.reply }]);
    } catch (cause) {
      setMessages(messages);
      setDraft(content);
      setError(cause instanceof Error ? cause.message : "Quick Chat could not reach BALMZ AI.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[70]">
      {open ? (
        <section aria-label="Quick Chat helper" className="mb-3 flex h-[min(540px,calc(100dvh-112px))] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b111c] shadow-2xl shadow-black/50">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <div><p className="text-sm font-semibold text-white">Quick Chat</p><p className="mt-0.5 text-[10px] text-slate-500">Ask BALMZ AI without leaving this page</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Quick Chat" className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-white/5 hover:text-white">×</button>
          </header>
          <div className="border-b border-white/[0.06] px-3 py-2">
            <label className="flex items-center gap-2 text-[10px] text-slate-500">Model
              <select aria-label="Quick Chat model" disabled={modelsLoading || !models.length || loading} value={model} onChange={(event) => setModel(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#101a28] px-2 py-1.5 text-[10px] text-slate-200">
                {models.map((item) => <option key={item.value} value={item.value}>{item.provider} · {item.label}</option>)}
                {!models.length ? <option value="">{modelsLoading ? "Loading models…" : "No connected model"}</option> : null}
              </select>
            </label>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {!messages.length ? <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 text-center"><span className="text-2xl text-[var(--balmz-orange)]">✳</span><p className="mt-2 text-xs font-semibold text-slate-200">What do you need a hand with?</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Quick questions, explanations and follow-ups stay in this small chat.</p></div> : null}
            {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-7 rounded-2xl rounded-br-md bg-[#182638] px-3 py-2.5 text-xs leading-5 text-white" : "mr-4 rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.035] px-3 py-2.5 text-xs leading-5 text-slate-200"}><p className="whitespace-pre-wrap break-words">{message.content}</p></div>)}
            {loading ? <p className="text-[10px] text-slate-500">BALMZ AI is thinking…</p> : null}
            <div ref={endRef} />
          </div>
          {error ? <p role="alert" className="border-t border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 text-[10px] leading-4 text-amber-100">{error}</p> : null}
          <div className="border-t border-white/[0.08] p-3">
            {!planActive ? <p className="mb-2 text-[10px] text-amber-200">An active plan is needed for AI requests.</p> : null}
            {!modelsLoading && !models.length && isAdmin ? <a href="/admin?section=ai-connections" className="mb-2 inline-flex text-[10px] font-semibold text-[var(--balmz-orange)]">Connect an AI provider</a> : null}
            {!modelsLoading && !models.length && !isAdmin ? <p className="mb-2 text-[10px] text-slate-500">Ask your Super Admin to connect an AI provider.</p> : null}
            <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex items-end gap-2 rounded-xl border border-white/10 bg-[#080d15] p-2 focus-within:border-[var(--balmz-orange)]/40">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} maxLength={12000} placeholder="Ask a quick question…" className="min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-xs leading-5 text-white outline-none placeholder:text-slate-600" />
              <button type="submit" disabled={!draft.trim() || loading || modelsLoading || !models.length || !planActive} className="rounded-lg bg-[var(--balmz-orange)] px-3 py-2 text-[10px] font-bold text-[#17100a] disabled:opacity-40">Send</button>
            </form>
            <p className="mt-2 text-[9px] text-slate-600">Uses your BALMZ AI message allowance.</p>
          </div>
        </section>
      ) : null}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="ml-auto flex min-h-12 items-center gap-2 rounded-full border border-[var(--balmz-orange)]/30 bg-[#151f2e] px-4 py-3 text-xs font-semibold text-white shadow-xl shadow-black/30 transition hover:border-[var(--balmz-orange)]/60 hover:bg-[#1a293b]">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--balmz-orange)] text-sm font-black text-[#17100a]">✳</span>
        {open ? "Close Quick Chat" : "Quick Chat"}
      </button>
    </div>
  );
}
