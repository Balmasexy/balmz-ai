"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

function getPostAuthDestination(): string {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("next") || "";
  const safePath = requested.startsWith("/dashboard") && !requested.startsWith("//") && !requested.includes("\\")
    ? requested
    : "/dashboard";
  const destination = new URL(safePath, window.location.origin);
  const prompt = params.get("prompt");
  if (prompt) destination.searchParams.set("prompt", prompt.slice(0, 4000));
  if (params.get("newChat") === "1") destination.searchParams.set("new", "1");
  return destination.pathname + destination.search;
}

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        callbackURL: getPostAuthDestination(),
      });
      if (result.error) {
        setError(result.error.message || "Unable to create your account. Please review your details.");
        return;
      }
      const statusResponse = await fetch("/api/auth/email-status", { cache: "no-store" });
      const emailStatus = await statusResponse.json().catch(() => ({})) as { enabled?: boolean };
      if (emailStatus.enabled) {
        setVerificationRequired(true);
      } else {
        window.location.assign("/dashboard");
      }
    } catch {
      setError("Registration is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    setResendMessage("");
    try {
      const result = await authClient.sendVerificationEmail({
        email: email.trim().toLowerCase(),
        callbackURL: getPostAuthDestination(),
      });
      if (result.error) throw new Error("Verification email could not be sent.");
      setResendMessage("A new verification email was requested. Check your inbox and spam folder.");
    } catch {
      setResendMessage("We could not send the email. Check your address or contact the administrator.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#212121] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-[28px] border border-white/[0.08] bg-[#303030] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-white"><Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={40} height={40} priority className="h-10 w-10 rounded-xl object-contain" /><span>BALMZ AI</span></Link>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-slate-400">Set up your secure BALMZ AI workspace.</p>

        {verificationRequired ? (
          <div className="mt-7 space-y-4">
            <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-100">Your account has been created. Verify your email address before signing in. Open the verification link from BALMZ AI in your inbox.</p>
            <button type="button" onClick={() => void resendVerification()} disabled={resending} className="w-full rounded-xl border border-orange-400/30 px-4 py-3 text-sm font-semibold text-orange-300 disabled:opacity-50">{resending ? "Sending…" : "Resend verification email"}</button>
            {resendMessage ? <p role="status" className="text-xs leading-5 text-slate-400">{resendMessage}</p> : null}
            <Link href="/sign-in" className="block text-center text-sm font-semibold text-[var(--balmz-orange)] hover:text-orange-300">Continue to sign in</Link>
          </div>
        ) : (
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm text-slate-300">
            Full name
            <input
              autoComplete="name"
              type="text"
              minLength={2}
              maxLength={100}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#212121] px-4 py-3 text-white outline-none transition focus:border-orange-400"
              placeholder="Your name"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Email address
            <input
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              autoComplete="new-password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400"
              placeholder="At least 12 characters"
            />
          </label>
          <p className="text-xs leading-5 text-slate-500">Use 12–128 characters. Your password is handled by the authentication provider and is never stored in application tables as plain text.</p>
          {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-[var(--balmz-orange)] px-4 py-3 font-semibold text-[#17100a] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
        )}

        <p className="mt-6 text-sm text-slate-400">
          Already registered? <Link href="/sign-in" className="font-semibold text-orange-400 hover:text-orange-300">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
