"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Provider = {
  id: string;
  label: string;
  description: string;
  scopes: string[];
  configured: boolean;
  redirectUri: string;
};
type Connection = {
  id: string;
  providerId: string;
  accountId: string;
  displayName: string;
  email: string | null;
  scopes: string[];
  expiresAt: string | null;
  status: "connected" | "reconnect_required" | "disconnected" | string;
  lastVerifiedAt: string | null;
  createdAt: string;
};

const providerOrder = ["google", "microsoft", "slack", "dropbox", "box", "github", "gitlab", "notion"];
const noStore = { cache: "no-store" as RequestCache };

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function providerMessage(id: string): string {
  switch (id) {
    case "google": return "Google";
    case "microsoft": return "Microsoft 365";
    case "slack": return "Slack";
    case "dropbox": return "Dropbox";
    case "box": return "Box";
    case "github": return "GitHub";
    case "gitlab": return "GitLab";
    case "notion": return "Notion";
    default: return id;
  }
}

export function ConnectionsWorkspace() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaRequired, setSchemaRequired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/integrations", noStore);
      const payload = await response.json() as {
        providers?: Provider[];
        connections?: Connection[];
        error?: string;
        message?: string;
      };
      setProviders(Array.isArray(payload.providers) ? payload.providers : []);
      setConnections(Array.isArray(payload.connections) ? payload.connections : []);
      setSchemaRequired(response.status === 503 && payload.error === "CUSTOMER_CONNECTION_SCHEMA_REQUIRED");
      if (!response.ok && payload.error !== "CUSTOMER_CONNECTION_SCHEMA_REQUIRED") {
        throw new Error(payload.message || "Your account connections could not be loaded.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your account connections are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const failure = params.get("error");
    if (connected) {
      setNotice(providerMessage(connected) + " was authorized. Confirm its connection status below.");
      window.history.replaceState({}, "", "/dashboard/connections");
    } else if (failure) {
      setError(failure === "customer_connection_schema_required"
        ? "The database owner must review and apply customer connection migrations 0011 and 0012 before accounts can be saved."
        : "The account connection did not complete (" + failure.replaceAll("_", " ") + "). Review the provider setup and try again.");
      window.history.replaceState({}, "", "/dashboard/connections");
    }
  }, [refresh]);

  const orderedProviders = useMemo(
    () => [...providers].sort((a, b) => providerOrder.indexOf(a.id) - providerOrder.indexOf(b.id)),
    [providers],
  );

  function connect(provider: Provider) {
    if (!provider.configured || schemaRequired || busyId) return;
    setBusyId(provider.id);
    setError("");
    window.location.assign("/api/integrations/" + encodeURIComponent(provider.id) + "/start");
  }

  async function disconnect(connection: Connection) {
    if (busyId) return;
    if (!window.confirm("Disconnect " + connection.displayName + " from your BALMZ AI account?")) return;
    setBusyId(connection.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message || "The account could not be disconnected.");
      setNotice(payload.message || "Account disconnected.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account could not be disconnected.");
    } finally {
      setBusyId("");
    }
  }

  async function refreshToken(connection: Connection) {
    if (busyId) return;
    setBusyId(connection.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const payload = await response.json() as { message?: string; error?: string; refreshed?: boolean };
      if (!response.ok) {
        throw new Error(payload.error === "OAUTH_REAUTH_REQUIRED"
          ? "This provider did not issue a refresh token. Disconnect and reconnect the account."
          : payload.message || "The account session could not be refreshed.");
      }
      setNotice("Account authorization refreshed.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account session could not be refreshed.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#080c14] pb-16 text-slate-100">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <Link href="/dashboard/plugins" className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">← Plugins</Link>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">My connections</p>
          <p className="text-[10px] text-slate-500">Your accounts · Your permissions</p>
        </div>
        <Link href="/dashboard/settings" className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Settings</Link>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <div className="max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--balmz-orange)]">Personal integrations</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Connect your accounts.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Authorize only the accounts you want BALMZ AI to use. Each connection belongs to your signed-in account. Shared Render, Neon, payment and AI-provider credentials remain under Super Admin control.</p>
        </div>

        {notice ? <div role="status" className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs leading-5 text-emerald-200">{notice}</div> : null}
        {error ? <div role="alert" className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs leading-5 text-rose-200">{error}</div> : null}
        {schemaRequired ? (
          <section className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
            <p className="text-sm font-semibold text-amber-100">Database preparation required</p>
            <p className="mt-2 text-xs leading-5 text-amber-100/70">The account connection code is staged, but the additive customer-connection migrations have not been applied to production. No account can be saved until the database owner has reviewed and approved migrations 0011 and 0012.</p>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Available providers</h2>
              <p className="mt-1 text-xs text-slate-500">An account is connected only after its real provider authorization completes.</p>
            </div>
            <span className="text-[10px] text-slate-500">{providers.filter((provider) => provider.configured).length} configured</span>
          </div>
          {loading ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="h-44 animate-pulse rounded-2xl bg-white/[0.05]"/><div className="h-44 animate-pulse rounded-2xl bg-white/[0.05]"/></div> : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {orderedProviders.map((provider) => {
                const owned = connections.filter((connection) => connection.providerId === provider.id);
                return (
                  <article key={provider.id} className="flex min-h-[220px] flex-col rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{provider.label}</h3>
                        <p className="mt-1 text-[10px] leading-5 text-slate-500">{provider.description}</p>
                      </div>
                      <span className={"shrink-0 rounded-full border px-2.5 py-1 text-[9px] " + (provider.configured ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.035] text-slate-500")}>{provider.configured ? "Configured" : "Not configured"}</span>
                    </div>
                    <div className="mt-4 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Requested permissions</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {provider.scopes.slice(0, 6).map((scope) => <span key={scope} className="max-w-full break-all rounded-md bg-white/[0.045] px-2 py-1 text-[9px] text-slate-400">{scope}</span>)}
                        {provider.scopes.length > 6 ? <span className="rounded-md bg-white/[0.045] px-2 py-1 text-[9px] text-slate-400">+{provider.scopes.length - 6} more</span> : null}
                      </div>
                    </div>
                    <div className="mt-4 border-t border-white/[0.07] pt-3">
                      <p className="text-[10px] text-slate-500">{owned.length} account{owned.length === 1 ? "" : "s"} connected</p>
                      <button type="button" disabled={!provider.configured || schemaRequired || Boolean(busyId)} onClick={() => connect(provider)} className="mt-3 w-full rounded-xl bg-[var(--balmz-orange)] px-4 py-2.5 text-xs font-semibold text-[#17100a] disabled:cursor-not-allowed disabled:opacity-40">{!provider.configured ? "Administrator setup required" : schemaRequired ? "Database setup required" : busyId === provider.id ? "Opening provider…" : "Connect account"}</button>
                      <a href={provider.redirectUri} className="mt-2 block break-all text-[9px] text-slate-600 underline underline-offset-2" target="_blank" rel="noreferrer">Registered callback URL</a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold text-white">Connected accounts</h2><p className="mt-1 text-xs text-slate-500">Only accounts authorized by your own session appear here.</p></div>
            <button type="button" onClick={() => void refresh()} disabled={loading || Boolean(busyId)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 disabled:opacity-40">Refresh list</button>
          </div>
          {!loading && connections.length === 0 ? <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-12 text-center"><p className="text-sm font-medium text-slate-300">No personal accounts connected</p><p className="mt-2 text-xs text-slate-500">Choose a provider above after its administrator setup is complete.</p></div> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {connections.map((connection) => (
              <article key={connection.id} className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="text-sm font-semibold text-white">{connection.displayName}</h3><p className="mt-1 text-[10px] text-slate-500">{providerMessage(connection.providerId)}{connection.email ? " · " + connection.email : ""}</p></div>
                  <span className={"rounded-full border px-2.5 py-1 text-[9px] " + (connection.status === "connected" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-200")}>{connection.status.replaceAll("_", " ")}</span>
                </div>
                <p className="mt-3 text-[10px] text-slate-500">Last verified: {formatDate(connection.lastVerifiedAt)} · Token expiry: {formatDate(connection.expiresAt)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={Boolean(busyId)} onClick={() => void refreshToken(connection)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] text-slate-300 disabled:opacity-40">{busyId === connection.id ? "Working…" : "Refresh authorization"}</button>
                  <button type="button" disabled={Boolean(busyId)} onClick={() => void disconnect(connection)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-[10px] text-rose-200 disabled:opacity-40">Disconnect</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-white">Your remote MCP servers</h2><p className="mt-1 text-xs text-slate-500">Connect your own standards-compatible AI tools with separate permissions.</p></div>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] text-slate-500">Setup pending</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">Remote MCP setup will be available after endpoint security checks, tool discovery and write-action approvals are implemented. No remote server is shown as connected until a real protocol handshake succeeds.</p>
        </section>
      </div>
    </main>
  );
}
