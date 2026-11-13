"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("token") || "";
    setToken(value);
    setInvalidLink(!value || Boolean(params.get("error")));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token || invalidLink) {
      setError("This password reset link is missing or has expired. Request a new link.");
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError("Your new password must contain 12–128 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setInvalidLink(true);
        setError("This reset link is invalid or has expired. Request a new password reset link.");
        return;
      }
      setComplete(true);
      setPassword("");
      setConfirmation("");
    } catch {
      setError("Your password could not be reset. Request a new link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080c14] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-white">
          <Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={40} height={40} priority className="h-10 w-10 rounded-xl object-contain" />
          <span>BALMZ AI</span>
        </Link>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">Reset your password</h1>
        {complete ? (
          <div className="mt-6 space-y-4">
            <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">Your password has been changed. Other active sessions have been revoked. Sign in again with your new password.</p>
            <Link href="/sign-in" className="inline-flex w-full justify-center rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a]">Return to sign in</Link>
          </div>
        ) : invalidLink ? (
          <div className="mt-6 space-y-4">
            <p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">This password reset link is invalid, missing or expired.</p>
            <Link href="/forgot-password" className="inline-flex w-full justify-center rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a]">Request a new reset link</Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-slate-400">Choose a new password with at least 12 characters. Your other active sessions will be signed out.</p>
            <form className="mt-7 space-y-5" onSubmit={submit}>
              <label className="block text-sm text-slate-300">
                New password
                <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400" />
              </label>
              <label className="block text-sm text-slate-300">
                Confirm new password
                <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400" />
              </label>
              {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
              <button type="submit" disabled={busy || !token} className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? "Updating password…" : "Update password"}
              </button>
            </form>
          </>
        )}
        <p className="mt-6 text-sm text-slate-400"><Link href="/sign-in" className="font-semibold text-orange-400 hover:text-orange-300">Back to sign in</Link></p>
      </section>
    </main>
  );
}
