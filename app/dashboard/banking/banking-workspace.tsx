"use client";

import Script from "next/script";
import Link from "next/link";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useCallback, useEffect, useState } from "react";

type BankAccount = { id: string; name: string; mask?: string | null; type?: string; subtype?: string | null };
type Institution = { institution_id?: string; name?: string };
type FundingSource = { id: string; name: string; institutionName: string; accountType: string; mask: string | null; status: string; achEnabled: boolean; environment: string };
type Customer = { id: string; environment: string; customer_type: string; provider_status: string; terms_accepted_at: string } | null;
type BankConnection = { id: string; institutionName: string; environment: string; status: string; createdAt: string; accounts: BankAccount[] };
type PlaidHandler = { open: () => void };
type NativePlaidLinkResult = {
  publicToken?: string;
  institution?: { name?: string };
  cancelled?: boolean;
};
const NativePlaidLink = registerPlugin<{
  open(options: { linkToken: string }): Promise<NativePlaidLinkResult>;
}>("PlaidLink");

declare global {
  interface Window {
    Plaid?: { create: (options: {
      token: string;
      receivedRedirectUri?: string;
      onSuccess: (publicToken: string, metadata: { institution?: Institution | null; accounts?: BankAccount[] }) => void;
      onExit: (error: { error_message?: string; error_code?: string } | null) => void;
    }) => PlaidHandler };
  }
}

export function BankingWorkspace({ userName }: { userName: string }) {
  const isAndroid = Capacitor.getPlatform() === "android";
  const [customer, setCustomer] = useState<Customer>(null);
  const [fundingSources, setFundingSources] = useState<FundingSource[]>([]);
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [scriptReady, setScriptReady] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedData, setAcceptedData] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [customerRes, sourcesRes, connectionsRes] = await Promise.all([
        fetch("/api/banking/customer", { cache: "no-store" }),
        fetch("/api/banking/funding-sources", { cache: "no-store" }),
        fetch("/api/banking/connections", { cache: "no-store" }),
      ]);
      const customerData = await customerRes.json() as { customer?: Customer; message?: string };
      const sourcesData = await sourcesRes.json() as { fundingSources?: FundingSource[]; message?: string };
      const connectionsData = await connectionsRes.json() as { connections?: BankConnection[]; message?: string };
      if (!customerRes.ok || !sourcesRes.ok || !connectionsRes.ok) {
        throw new Error(customerData.message || sourcesData.message || connectionsData.message || "Banking data could not be loaded.");
      }
      setCustomer(customerData.customer ?? null);
      setFundingSources(sourcesData.fundingSources ?? []);
      setConnections(connectionsData.connections ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The banking workspace is unavailable.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function setupProfile() {
    if (busy) return;
    setBusy("profile"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/banking/customer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedTerms, acceptedDataSharing: acceptedData }),
      });
      const result = await response.json() as { message?: string; success?: boolean };
      if (!response.ok || !result.success) throw new Error(result.message || "The bank-transfer profile could not be set up.");
      setNotice(result.message || "Bank profile ready.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profile setup failed.");
    } finally { setBusy(""); }
  }

  async function saveBankConnection(publicToken: string, institution?: Institution | null) {
    setBusy("saving-bank");
    const response = await fetch("/api/banking/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicToken, institution }),
    });
    const saved = await response.json() as { message?: string; success?: boolean };
    if (!response.ok || !saved.success) throw new Error(saved.message || "The bank could not be connected.");
    setNotice(saved.message || "Bank connection saved.");
    await refresh();
  }

  async function connectBank() {
    if (busy || (!isAndroid && (!scriptReady || !window.Plaid))) return;
    setBusy("link-token"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/banking/link-token", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: isAndroid ? "android" : "web" }),
      });
      const result = await response.json() as { linkToken?: string; message?: string };
      if (!response.ok || !result.linkToken) throw new Error(result.message || "The secure bank login could not be opened.");

      if (isAndroid) {
        const nativeResult = await NativePlaidLink.open({ linkToken: result.linkToken });
        if (nativeResult.cancelled) {
          setBusy("");
          return;
        }
        if (!nativeResult.publicToken) throw new Error("Plaid Link did not return a bank connection token.");
        await saveBankConnection(nativeResult.publicToken, nativeResult.institution ?? null);
        setBusy("");
        return;
      }

      const handler = window.Plaid!.create({
        token: result.linkToken,
        ...(window.location.search ? { receivedRedirectUri: window.location.href } : {}),
        onSuccess: async (publicToken, metadata) => {
          try {
            await saveBankConnection(publicToken, metadata.institution);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The bank could not be saved.");
          } finally { setBusy(""); }
        },
        onExit: (linkError) => {
          if (linkError?.error_message) setError("Plaid Link: " + linkError.error_message);
          setBusy("");
        },
      });
      setBusy("");
      handler.open();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Plaid Link could not be opened.");
      setBusy("");
    }
  }

  async function removeFundingSource(source: FundingSource) {
    if (busy || !window.confirm("Remove " + source.institutionName + " " + source.accountType + " ending " + (source.mask || "----") + " from BALMZ AI?")) return;
    setBusy(source.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/banking/disconnect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundingSourceId: source.id }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "The bank funding source could not be removed.");
      setNotice("Bank funding source removed.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bank removal failed.");
    } finally { setBusy(""); }
  }

  return (
    <main className="min-h-[100dvh] bg-[#080c14] pb-12 text-slate-100">
      {!isAndroid ? <Script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js" strategy="afterInteractive" onLoad={() => setScriptReady(true)} onError={() => setError("Plaid Link could not be loaded. Check the network and try again.")} /> : null}
      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <div><p className="text-sm font-semibold text-white">Bank connections</p><p className="mt-0.5 text-[10px] text-slate-500">Private bank linking · Plaid authentication</p></div>
        <Link href="/dashboard/settings" className="inline-flex min-h-10 items-center rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300">Back to Settings</Link>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-8 sm:py-9">
        <section className="rounded-3xl border border-[var(--balmz-orange)]/20 bg-gradient-to-br from-[#151d2a] to-[#0b111c] p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--balmz-orange)]">Private financial connections</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Connect your bank securely</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">Your bank's sign-in, multi-factor authentication and one-time verification code stay inside Plaid Link. BALMZ AI never asks you to type or share a bank OTP with us. The backend stores an encrypted provider token and limited account metadata.</p>
          <div className="mt-5 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
            <p className="text-xs font-semibold text-slate-200">Signed in as {userName}</p>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">This is a separate Settings page, not a dashboard card. Each bank connection is isolated to your signed-in account.</p>
          </div>
        </section>

        {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs text-rose-300">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-3 text-xs text-emerald-300">{notice}</p> : null}

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">1. Consent and bank-transfer profile</h2><span className="text-[10px] text-slate-500">{customer ? "Profile created" : "Not set up"}</span></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">A separate transfer profile is required to establish an ACH funding source. The provider may require identity and business verification before enabling transfers.</p>
          <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-slate-300"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 accent-orange-500" />I agree to create a bank-transfer profile with the transfer provider and understand it is not a bank account or a deposit guarantee.</label>
          <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-slate-300"><input type="checkbox" checked={acceptedData} onChange={(event) => setAcceptedData(event.target.checked)} className="mt-1 accent-orange-500" />I consent to Plaid sharing the selected bank account authentication data with the transfer provider to establish an ACH funding source.</label>
          <button type="button" onClick={() => void setupProfile()} disabled={Boolean(busy) || customer !== null || !acceptedTerms || !acceptedData} className="mt-4 min-h-11 w-full rounded-xl bg-[var(--balmz-orange)] px-4 text-xs font-bold text-[#17100a] disabled:opacity-40">{busy === "profile" ? "Setting up profile…" : customer ? "Bank-transfer profile created" : "Set up bank-transfer profile"}</button>
          {customer ? <p className="mt-3 text-[10px] text-slate-500">Provider profile: {customer.provider_status} · Environment: {customer.environment} · Type: {customer.customer_type}</p> : null}
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">2. Authenticate with your bank</h2><span className="text-[10px] text-slate-500">{connections.length} linked</span></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Plaid Link opens your bank's sign-in and verification flow. Select an eligible checking or savings account. Never send your bank password or OTP to BALMZ AI support.</p>
          <button type="button" onClick={() => void connectBank()} disabled={Boolean(busy) || (!isAndroid && !scriptReady)} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--balmz-orange)] px-4 text-sm font-bold text-[#17100a] disabled:opacity-40">{busy === "link-token" ? "Preparing secure bank link…" : busy === "saving-bank" ? "Saving secure connection…" : !isAndroid && !scriptReady ? "Loading secure bank link…" : isAndroid ? "Open secure bank sign-in (Android)" : "Open secure bank sign-in"}</button>
          <p className="mt-2 text-[10px] text-slate-600">Plaid environment is selected by the server. Android uses the official Plaid SDK; web uses Plaid Link. Bank MFA/OTP happens inside Plaid.</p>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-white">3. Linked banks and ACH status</h2><button type="button" onClick={() => void refresh()} className="text-[10px] font-semibold text-[var(--balmz-orange)]">Refresh</button></div>
          {connections.length || fundingSources.length ? <div className="mt-4 space-y-3">
            {connections.map((connection) => <article key={connection.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-white">{connection.institutionName}</p><p className="mt-1 text-[10px] text-slate-500">Bank sign-in connected · {connection.environment}</p></div><span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-[9px] text-emerald-300">{connection.status}</span></div>
              <div className="mt-3 space-y-2">{connection.accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.025] p-3"><div><p className="text-xs text-slate-200">{account.name}</p><p className="mt-1 text-[10px] text-slate-500">{account.subtype || account.type || "Bank account"} · •••• {account.mask || "—"}</p></div><span className="text-[9px] text-slate-500">Linked</span></div>)}</div>
            </article>)}
            {fundingSources.map((source) => <article key={source.id} className="rounded-xl border border-white/[0.07] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold text-white">{source.institutionName}</p><p className="mt-1 text-[10px] text-slate-500">{source.accountType} · •••• {source.mask || "—"}</p></div><span className={"rounded-full border px-2 py-1 text-[9px] " + (source.achEnabled ? "border-emerald-400/20 text-emerald-300" : "border-amber-400/20 text-amber-200")}>{source.achEnabled ? "ACH verified" : source.status}</span></div>
              <div className="mt-3 flex justify-end"><button type="button" onClick={() => void removeFundingSource(source)} disabled={Boolean(busy)} className="min-h-9 rounded-lg border border-rose-400/20 px-3 text-[10px] text-rose-300 disabled:opacity-40">{busy === source.id ? "Removing…" : "Remove bank link"}</button></div>
            </article>)}
          </div> : <p className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">No bank connections saved yet.</p>}
        </section>

        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
          <h2 className="text-sm font-semibold text-amber-200">ACH money-movement status</h2>
          <p className="mt-2 text-xs leading-6 text-slate-400">A successful bank login is not the same as an ACH-verified funding source. Transfers remain disabled until the provider confirms the funding source, the customer completes required verification, and NMI gives BALMZ AI written production approval.</p>
          <p className="mt-3 text-xs font-semibold text-slate-200">Transfers: Not activated</p>
        </section>
      </div>
    </main>
  );
}
