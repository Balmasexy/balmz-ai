"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        callbackURL: "/dashboard",
      });
      if (result.error) {
        setError(result.error.message || "Unable to sign in. Check your details and try again.");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080c14] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold tracking-[0.2em] text-white"><Image src="/balmz-logo.svg" alt="BALMZ AI logo" width={40} height={40} priority className="h-10 w-10 rounded-xl object-contain" /><span>BALMZ AI</span></Link>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to continue to your workspace.</p>

        <form className="mt-8 space-y-5" onSubmit={submit}>
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
          <div className="block text-sm text-slate-300">
            <label htmlFor="sign-in-password">Password</label>
            <div className="mt-2 flex overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] transition focus-within:border-orange-400">
              <input
                id="sign-in-password"
                autoComplete="current-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none"
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="shrink-0 px-4 text-sm font-semibold text-orange-400 transition hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          New to BALMZ AI? <Link href="/sign-up" className="font-semibold text-orange-400 hover:text-orange-300">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
