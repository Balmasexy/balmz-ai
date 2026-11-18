"use client";
import { useCallback, useEffect, useState } from "react";
type AccountAction = { id: string; label: string; requiresQuery?: boolean };
type AccountConnection = { id: string; providerId: string; displayName: string; email: string | null; status: string; expiresAt: string | null; lastVerifiedAt: string | null; actions: AccountAction[] };
type ActionResult = { providerId: string; actionId: string; count: number; data: Record<string, unknown>[] };

function providerLabel(id: string) {
  return ({ google: "Google", microsoft: "Microsoft 365", slack: "Slack", dropbox: "Dropbox", box: "Box", github: "GitHub", gitlab: "GitLab", notion: "Notion" } as Record<string, string>)[id] ?? id;
}

export function AccountActionsSection() {
  const [connections, setConnections] = useState<AccountConnection[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, ActionResult>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/integrations/actions", { cache: "no-store" });
      const payload = await response.json() as { connections?: AccountConnection[]; error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "Account actions could not be loaded.");
      setConnections(payload.connections ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Account actions could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function runAction(connection: AccountConnection, action: AccountAction) {
    const key = connection.id + ":" + action.id;
    if (busy) return;
    if (action.requiresQuery && query.trim().length < 2) { setError("Enter at least two characters to search."); return; }
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id, actionId: action.id, ...(query.trim() ? { query: query.trim() } : {}) }),
      });
      const payload = await response.json() as ActionResult & { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message || payload.error || "The provider action failed.");
      setResults((current) => ({ ...current, [key]: payload }));
      setNotice(action.label + " completed · " + payload.count + " result(s).");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The provider action failed."); }
    finally { setBusy(""); }
  }

  return (
    <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-white">Connected account tools</h2><p className="mt-1 text-xs text-slate-500">Run real, read-only actions with your own authorized account tokens.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading || Boolean(busy)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 disabled:opacity-40">Refresh</button>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] p-3 text-xs text-rose-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-3 text-xs text-emerald-200">{notice}</p> : null}
      {connections.some((connection) => connection.actions.some((action) => action.requiresQuery)) ? <label className="mt-5 block"><span className="text-[10px] font-medium text-slate-400">Search term for search actions</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={1200} placeholder="Search your mailbox, Slack messages or Notion pages" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600"/></label> : null}
      {loading ? <div className="mt-5 h-28 animate-pulse rounded-xl bg-white/[0.04]"/> : connections.length ? (
        <div className="mt-5 space-y-4">
          {connections.map((connection) => (
            <article key={connection.id} className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-semibold text-white">{connection.displayName}</h3><p className="mt-1 text-[10px] text-slate-500">{providerLabel(connection.providerId)}{connection.email ? " · " + connection.email : ""}</p></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] text-emerald-300">Authorized</span></div>
              <div className="mt-3 flex flex-wrap gap-2">{connection.actions.map((action) => { const key = connection.id + ":" + action.id; return <button key={action.id} type="button" disabled={Boolean(busy)} onClick={() => void runAction(connection, action)} className="rounded-lg border border-[var(--balmz-orange)]/25 px-3 py-2 text-[10px] text-[var(--balmz-orange)] disabled:opacity-40">{busy === key ? "Loading…" : action.label}</button>; })}</div>
              {connection.actions.map((action) => { const key = connection.id + ":" + action.id; const result = results[key]; return result ? <div key={key} className="mt-3 rounded-lg border border-white/[0.06] bg-[#080d15] p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold text-slate-300">{action.label}</p><span className="text-[9px] text-slate-500">{result.count} items</span></div><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-slate-400">{JSON.stringify(result.data, null, 2)}</pre></div> : null; })}
            </article>
          ))}
        </div>
      ) : <p className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-slate-500">Connect a personal account above to use its read-only actions here.</p>}
      <p className="mt-4 text-[9px] leading-5 text-slate-600">These first-party actions are read-only. BALMZ AI does not send emails, edit files, create calendar events, post messages or modify connected accounts through this workspace.</p>
    </section>
  );
}