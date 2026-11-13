"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/email-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { enabled?: boolean }) => { if (active) setEmailEnabled(data.enabled === true); })
      .catch(() => { if (active) setEmailEnabled(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSent(false);
    if (!emailEnabled) {
      setError("Password reset email delivery is not configured yet. Please contact the BALMZ AI administrator.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: window.location.origin + "/reset-password",
      });
      if (result.error) {
        setError("The reset request could not be sent. Check your address and try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("The reset request is temporarily unavailable. Please try again.");
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
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Enter the email address on your account. When email delivery is enabled, we will send a secure, time-limited reset link.</p>
        {emailEnabled === false ? <p role="status" className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">Password recovery is not available until the administrator configures the verified transactional email sender.</p> : null}
        <form className="mt-7 space-y-5" onSubmit={submit}>
          <label className="block text-sm text-slate-300">
            Email address
            <input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400" placeholder="you@example.com" />
          </label>
          {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
          {sent ? <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">If an account exists for this address, a reset link has been sent. Check your inbox and spam folder.</p> : null}
          <button type="submit" disabled={busy || emailEnabled !== true} className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Sending reset link…" : "Send reset link"}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-400"><Link href="/sign-in" className="font-semibold text-orange-400 hover:text-orange-300">Back to sign in</Link></p>
      </section>
    </main>
  );
}
