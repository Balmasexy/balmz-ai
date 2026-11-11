"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Mode = "pin" | "setup";

export default function SignInPage() {
  const [mode, setMode] = useState<Mode>("pin");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in/pin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), pin }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.message || "Email or PIN is incorrect. Try again.");
        return;
      }
      window.location.assign("/dashboard");
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitInitialPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim().toLowerCase(),
        password,
        callbackURL: "/create-pin",
      });
      if (result.error) {
        setError(result.error.message || "Unable to sign in. Check your details and try again.");
        return;
      }
      window.location.assign("/create-pin");
    } catch {
      setError("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080c14] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-orange-400">BALMZ AI</Link>
        <h1 className="mt-7 text-3xl font-semibold tracking-tight">Welcome back</h1>
        {mode === "pin" ? (
          <>
            <p className="mt-2 text-sm text-slate-400">Sign in with your registered email and six-digit PIN.</p>
            <form className="mt-8 space-y-5" onSubmit={submitPin}>
              <label className="block text-sm text-slate-300">
                Gmail address
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
                Six-digit PIN
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  type="password"
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
              {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
              <button
                type="submit"
                disabled={busy || pin.length !== 6}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Sign in with PIN"}
              </button>
            </form>
            <div className="mt-5 flex flex-col gap-3 text-sm">
              <Link href="/forgot-password" className="font-semibold text-orange-400 hover:text-orange-300">Forgot password?</Link>
              <button type="button" onClick={() => { setMode("setup"); setError(""); }} className="text-left text-slate-400 hover:text-white">
                First time here? Use your account password once to create a PIN
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-400">Existing accounts without a PIN can use their password once to set one up.</p>
            <form className="mt-8 space-y-5" onSubmit={submitInitialPassword}>
              <label className="block text-sm text-slate-300">
                Gmail address
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
                <label htmlFor="bootstrap-password">Current account password</label>
                <div className="mt-2 flex overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] transition focus-within:border-orange-400">
                  <input
                    id="bootstrap-password"
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
                className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Checking account…" : "Continue to create PIN"}
              </button>
            </form>
            <button type="button" onClick={() => { setMode("pin"); setError(""); }} className="mt-5 text-sm font-semibold text-orange-400 hover:text-orange-300">
              Back to PIN login
            </button>
          </>
        )}

        <p className="mt-7 text-sm text-slate-400">
          New to BALMZ AI? <Link href="/sign-up" className="font-semibold text-orange-400 hover:text-orange-300">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
