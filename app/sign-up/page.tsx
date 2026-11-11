"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        callbackURL: "/dashboard",
      });
      if (result.error) {
        setError(result.error.message || "Unable to create your account. Please review your details.");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Registration is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080c14] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-orange-400">BALMZ AI</Link>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-sm text-slate-400">Set up your secure BALMZ AI workspace.</p>

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
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400"
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
            className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-400">
          Already registered? <Link href="/sign-in" className="font-semibold text-orange-400 hover:text-orange-300">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
