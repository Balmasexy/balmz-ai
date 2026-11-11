"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmNativeAction } from "@/lib/capacitor/native-helpers";

type FamilyUser = {
  id: string; name: string; email: string; emailVerified: boolean; createdAt: string;
  grant_id: string | null; grant_batch_id: string | null; duration: string | null;
  prompt_tag: string | null; starts_at: string | null; expires_at: string | null;
  has_active_grant: boolean;
};
const durations = [
  ["week", "1 week"], ["1_month", "1 month"], ["3_months", "3 months"],
  ["6_months", "6 months"], ["9_months", "9 months"], ["1_year", "1 year"],
  ["lifetime", "Lifetime free"],
] as const;

export function FamilyAccessSection() {
  const [users, setUsers] = useState<FamilyUser[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [grantFilter, setGrantFilter] = useState("all");
  const [verified, setVerified] = useState("all");
  const [duration, setDuration] = useState("week");
  const [promptTag, setPromptTag] = useState("BALMZ_FAMILY");
  const [sharedPrompt, setSharedPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q: search, grant: grantFilter, verified });
      const response = await fetch("/api/admin/family-access?" + params.toString(), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not load registered users.");
      setUsers(result.users as FamilyUser[]);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load registered users.");
    } finally { setLoading(false); }
  }, [search, grantFilter, verified]);

  useEffect(() => { void load(); }, [load]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function grantAccess() {
    if (!selected.length || saving) return;
    const confirmed = await confirmNativeAction(
      "Grant family access",
      "Grant " + duration.replaceAll("_", " ") + " of complimentary access to " + selected.length + " selected account(s) using prompt tag " + promptTag + "?",
    );
    if (!confirmed) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/family-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected, duration, promptTag, sharedPrompt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not create family access.");
      setMessage("Complimentary access granted to " + result.recipients + " account(s).");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create family access."); }
    finally { setSaving(false); }
  }

  async function revoke(grantId: string) {
    if (saving) return;
    const confirmed = await confirmNativeAction("Revoke complimentary access", "This user will return to their normal subscription allowance. Continue?");
    if (!confirmed) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/family-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", grantId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not revoke access.");
      setMessage("Complimentary access revoked.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke access."); }
    finally { setSaving(false); }
  }

  const allVisibleSelected = users.length > 0 && users.every((user) => selected.includes(user.id));
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-orange-400/15 bg-orange-400/[0.045] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Family & complimentary access</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Select registered members and share a workspace prompt.</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-400">Each person keeps their own account, password and private chat history. The shared instruction is added privately to AI context while the grant is active. Grants can be revoked and all changes are audited.</p>
      </section>

      {message ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-xs text-emerald-200">{message}</p> : null}
      {error ? <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-xs text-rose-200">{error}</p> : null}

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs text-slate-400">Search name or email
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts..." className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-orange-400/40" />
          </label>
          <label className="text-xs text-slate-400">Grant filter
            <select value={grantFilter} onChange={(event) => setGrantFilter(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#101a29] px-3 text-sm text-white"><option value="all">All users</option><option value="ungranted">No active grant</option><option value="granted">Already granted</option></select>
          </label>
          <label className="text-xs text-slate-400">Email verification
            <select value={verified} onChange={(event) => setVerified(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#101a29] px-3 text-sm text-white"><option value="all">All statuses</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{users.length} accounts shown · maximum 150 per search</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected(allVisibleSelected ? [] : users.map((user) => user.id))} className="min-h-10 rounded-lg border border-white/10 px-3 text-xs text-slate-300">{allVisibleSelected ? "Clear selection" : "Select visible"}</button>
            <button type="button" onClick={() => void load()} className="min-h-10 rounded-lg border border-orange-400/20 px-3 text-xs font-semibold text-orange-200">Search / refresh</button>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.07]">
          {loading ? <p className="p-6 text-center text-xs text-slate-500">Loading accounts…</p> : users.length === 0 ? <p className="p-6 text-center text-xs text-slate-500">No matching registered user accounts.</p> : users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-center gap-3 border-b border-white/[0.055] px-4 py-3 last:border-b-0">
              <input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} aria-label={"Select " + user.email} className="h-4 w-4 accent-orange-500" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-200">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
              <span className={"rounded-full border px-2 py-1 text-[10px] " + (user.emailVerified ? "border-emerald-400/20 text-emerald-300" : "border-amber-400/20 text-amber-300")}>{user.emailVerified ? "Verified" : "Unverified"}</span>
              {user.has_active_grant ? <div className="flex items-center gap-2"><span className="rounded-full border border-orange-400/20 px-2 py-1 text-[10px] text-orange-200">{user.duration === "lifetime" ? "Lifetime" : user.duration?.replaceAll("_", " ")}</span><button type="button" disabled={saving} onClick={() => user.grant_id && void revoke(user.grant_id)} className="text-[10px] text-rose-300 disabled:opacity-40">Revoke</button></div> : <span className="text-[10px] text-slate-600">No active grant</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">Grant complimentary access</h3><span className="text-[10px] text-slate-500">{selected.length} selected</span></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">Duration
            <select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#101a29] px-3 text-sm text-white">{durations.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <label className="text-xs text-slate-400">Prompt tag
            <input value={promptTag} onChange={(event) => setPromptTag(event.target.value)} maxLength={80} placeholder="e.g. FAMILY_SUPPORT" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-orange-400/40" />
          </label>
        </div>
        <label className="mt-4 block text-xs text-slate-400">Shared prompt / instruction
          <textarea value={sharedPrompt} onChange={(event) => setSharedPrompt(event.target.value)} rows={4} maxLength={4000} placeholder="Write the shared instruction that should be included in the AI context for each selected user…" className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-white outline-none focus:border-orange-400/40" />
        </label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-[10px] leading-5 text-slate-500">A new grant replaces any previous active complimentary grant for that user. Lifetime grants have no expiry but can still be revoked by an administrator.</p>
          <button type="button" disabled={saving || selected.length === 0 || sharedPrompt.trim().length < 10 || !promptTag.trim()} onClick={() => void grantAccess()} className="min-h-11 rounded-xl bg-[var(--balmz-orange)] px-5 text-xs font-bold text-[#17100a] disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving…" : "Grant access to selected users"}</button>
        </div>
      </section>
    </div>
  );
}
