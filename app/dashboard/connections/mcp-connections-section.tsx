"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

type McpTool = { name: string; description: string; inputSchema: Record<string, unknown>; readOnly: boolean };
type McpConnection = { id: string; displayName: string; endpointUrl: string; authType: "none" | "bearer"; status: string; serverName: string | null; serverVersion: string | null; tools: McpTool[]; lastTestedAt: string | null };

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available" : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function McpConnectionsSection() {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [args, setArgs] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [schemaRequired, setSchemaRequired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations/mcp", { cache: "no-store" });
      const payload = await response.json() as { connections?: McpConnection[]; error?: string };
      if (response.ok) setConnections(payload.connections ?? []);
      else if (payload.error === "CUSTOMER_CONNECTION_SCHEMA_REQUIRED") setSchemaRequired(true);
      else throw new Error(payload.error || "MCP connections could not be loaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP connections could not be loaded.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function addConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || schemaRequired) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, endpointUrl: endpoint, ...(bearerToken.trim() ? { bearerToken: bearerToken.trim() } : {}) }),
      });
      const payload = await response.json() as { connection?: McpConnection; error?: string; message?: string };
      if (!response.ok || !payload.connection) throw new Error(payload.message || payload.error || "MCP connection failed.");
      setConnections((current) => [payload.connection!, ...current]);
      setName(""); setEndpoint(""); setBearerToken("");
      setNotice("MCP server connected and its tools were discovered.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP connection failed.");
    } finally { setBusy(false); }
  }

  async function refreshTools(connection: McpConnection) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/mcp/" + encodeURIComponent(connection.id) + "/tools", { cache: "no-store" });
      const payload = await response.json() as { tools?: McpTool[]; error?: string };
      if (!response.ok || !Array.isArray(payload.tools)) throw new Error(payload.error || "Tool discovery failed.");
      setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, tools: payload.tools! } : item));
      setNotice("Discovered " + payload.tools.length + " tools from " + connection.displayName + ".");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tool discovery failed.");
    } finally { setBusy(false); }
  }

  async function runTool(connection: McpConnection, tool: McpTool) {
    const key = connection.id + ":" + tool.name;
    let input: unknown;
    try { input = JSON.parse(args[key] || "{}"); }
    catch { setError("Enter valid JSON arguments for " + tool.name + "."); return; }
    setBusy(true); setError(""); setResults((current) => ({ ...current, [key]: "" }));
    try {
      const send = (confirmed: boolean, approvalRequestId?: string) => fetch("/api/integrations/mcp/" + encodeURIComponent(connection.id) + "/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolName: tool.name, arguments: input, confirmed, ...(approvalRequestId ? { approvalRequestId } : {}) }),
      });
      let response = await send(false);
      let payload = await response.json() as { result?: unknown; error?: string; message?: string; requestId?: string };
      if (response.status === 409 && payload.error === "MCP_APPROVAL_REQUIRED") {
        if (!window.confirm("Confirm this external action?\n\nTool: " + tool.name + "\n\nArguments:\n" + JSON.stringify(input, null, 2) + "\n\nOnly approve if these exact details are correct.")) {
          throw new Error("Action cancelled. The tool was not run.");
        }
        response = await send(true, payload.requestId);
        payload = await response.json() as { result?: unknown; error?: string; message?: string; requestId?: string };
      }
      if (!response.ok) throw new Error(payload.message || payload.error || "MCP tool call failed.");
      setResults((current) => ({ ...current, [key]: JSON.stringify(payload.result ?? {}, null, 2).slice(0, 12000) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP tool call failed.");
    } finally { setBusy(false); }
  }

  async function removeConnection(connection: McpConnection) {
    if (!window.confirm("Remove " + connection.displayName + " and its saved credential from BALMZ AI?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/integrations/mcp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "MCP connection could not be removed.");
      setConnections((current) => current.filter((item) => item.id !== connection.id));
      setNotice("MCP server disconnected.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "MCP disconnect failed.");
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-white">Your remote MCP servers</h2><p className="mt-1 text-xs text-slate-500">Connect HTTPS MCP endpoints you control and review their tools.</p></div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] text-slate-400">{connections.length} connected</span>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] p-3 text-xs text-rose-200">{error}</p> : null}
      {notice ? <p role="status" className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] p-3 text-xs text-emerald-200">{notice}</p> : null}
      {schemaRequired ? <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100/80">Database migrations 0011 and 0012 require owner review and approval before remote MCP connections can be saved.</p> : null}
      <form onSubmit={addConnection} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="text-[10px] font-medium text-slate-400">Connection name</span><input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="My project tools" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600" /></label>
        <label className="block"><span className="text-[10px] font-medium text-slate-400">MCP HTTPS endpoint</span><input required type="url" maxLength={1000} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://tools.example.com/mcp" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600" /></label>
        <label className="block sm:col-span-2"><span className="text-[10px] font-medium text-slate-400">Optional bearer token</span><input type="password" autoComplete="off" maxLength={4096} value={bearerToken} onChange={(event) => setBearerToken(event.target.value)} placeholder="Only if your MCP server requires bearer authentication" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#080d15] px-3 text-sm text-white outline-none placeholder:text-slate-600" /></label>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] leading-5 text-slate-500">HTTPS public addresses only. Private targets and redirects are blocked. Credentials are encrypted and scoped to your account.</p><button disabled={busy || schemaRequired} className="rounded-xl bg-[var(--balmz-orange)] px-4 py-2.5 text-xs font-semibold text-[#17100a] disabled:opacity-40">{busy ? "Working…" : schemaRequired ? "Database setup required" : "Connect and discover tools"}</button></div>
      </form>
      <div className="mt-6 space-y-3">
        {connections.map((connection) => (
          <article key={connection.id} className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-sm font-semibold text-white">{connection.displayName}</h3><p className="mt-1 break-all text-[10px] text-slate-500">{connection.endpointUrl}</p><p className="mt-1 text-[9px] text-slate-600">{connection.serverName || "MCP server"} · {connection.authType === "bearer" ? "Bearer authenticated" : "No authentication"} · Last tested {formatDate(connection.lastTestedAt)}</p></div>
              <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void refreshTools(connection)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 disabled:opacity-40">Refresh tools</button><button type="button" disabled={busy} onClick={() => void removeConnection(connection)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-[10px] text-rose-200 disabled:opacity-40">Disconnect</button></div>
            </div>
            <div className="mt-4 grid gap-2">
              {connection.tools.map((tool) => {
                const key = connection.id + ":" + tool.name;
                return <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-200">{tool.name}</p><span className={"rounded-full border px-2 py-1 text-[9px] " + (tool.readOnly ? "border-emerald-400/20 text-emerald-300" : "border-amber-400/20 text-amber-200")}>{tool.readOnly ? "Read-only annotation" : "Confirmation required"}</span></div>
                  {tool.description ? <p className="mt-1 text-[10px] leading-5 text-slate-500">{tool.description}</p> : null}
                  <textarea rows={2} value={args[key] ?? "{}"} onChange={(event) => setArgs((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 w-full rounded-lg border border-white/10 bg-[#080d15] p-2 font-mono text-[10px] text-slate-300 outline-none" aria-label={"JSON arguments for " + tool.name} />
                  <button type="button" disabled={busy} onClick={() => void runTool(connection, tool)} className="mt-2 rounded-lg border border-[var(--balmz-orange)]/30 px-3 py-2 text-[10px] text-[var(--balmz-orange)] disabled:opacity-40">Run tool</button>
                  {results[key] ? <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-[10px] text-slate-300">{results[key]}</pre> : null}
                </div>;
              })}
              {!connection.tools.length ? <p className="text-[10px] text-slate-500">No tools were returned by this MCP server.</p> : null}
            </div>
          </article>
        ))}
      </div>
      {!connections.length ? <p className="mt-5 text-xs text-slate-500">No customer MCP servers connected yet.</p> : null}
    </section>
  );
}
