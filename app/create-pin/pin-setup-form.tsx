"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function PinSetupForm({ email }: { email: string }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (pin.length !== 6 || confirmPin.length !== 6 || pin !== confirmPin) {
      setError("Enter the same six-digit PIN in both fields.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/pin/setup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirmPin }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message || "Unable to save your PIN. Please try again.");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("PIN setup is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080c14] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-orange-400">BALMZ AI</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Account security · 1 of 1</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Create your six-digit PIN</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Your account email is {email}. Create a PIN to use for future sign-ins. Your original password remains available only for the first-time PIN setup and password recovery.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm text-slate-300">
            Create PIN
            <input
              autoComplete="new-password"
              inputMode="numeric"
              type={showPin ? "text" : "password"}
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-center text-2xl tracking-[0.45em] text-white outline-none transition focus:border-orange-400"
              placeholder="••••••"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Confirm PIN
            <input
              autoComplete="new-password"
              inputMode="numeric"
              type={showPin ? "text" : "password"}
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-center text-2xl tracking-[0.45em] text-white outline-none transition focus:border-orange-400"
              placeholder="••••••"
            />
          </label>
          <button type="button" onClick={() => setShowPin((value) => !value)} className="text-sm font-semibold text-orange-400 hover:text-orange-300">
            {showPin ? "Hide PIN" : "Show PIN"}
          </button>
          <p className="text-xs leading-5 text-slate-500">Avoid birthdays, repeated digits, and simple sequences. After setup, use your email and PIN to sign in.</p>
          {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || pin.length !== 6 || confirmPin.length !== 6}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving secure PIN…" : "Create PIN and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
