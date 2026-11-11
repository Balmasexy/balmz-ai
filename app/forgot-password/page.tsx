"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Step = "email" | "code" | "pin" | "password";

async function postAuth(path: string, body: Record<string, string>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Unable to complete this step. Check the details and try again.");
  return result;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await postAuth("recovery/request-code", { email: normalizedEmail });
      setEmail(normalizedEmail);
      setMessage("If this email is registered, a six-digit code has been sent to that inbox. Check your spam folder too.");
      setStep("code");
    } catch {
      setError("We could not process that request right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await postAuth("recovery/verify-code", { email, code });
      setMessage("");
      setStep("pin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The code is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await postAuth("recovery/verify-pin", { email, pin });
      setResetToken(result.resetToken);
      setMessage("");
      setStep("password");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The PIN is invalid or has expired.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError("Your new password must contain 12–128 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await postAuth("recovery/complete-password", { email, resetToken, newPassword });
      setStep("password");
      window.location.assign("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to change your password. Restart recovery and try again.");
    } finally {
      setBusy(false);
    }
  }

  const stepNumber = step === "email" ? 1 : step === "code" ? 2 : step === "pin" ? 3 : 4;
  const heading =
    step === "email" ? "Recover your account" :
    step === "code" ? "Enter your email code" :
    step === "pin" ? "Confirm your six-digit PIN" :
    "Create a new password";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080c14] px-5 py-12 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl sm:p-9">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-orange-400">BALMZ AI</Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Account recovery · Step {stepNumber} of 4</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          {step === "email" ? "Enter your registered Gmail address. We only send recovery codes to existing BALMZ AI accounts." :
           step === "code" ? "Enter the six-digit one-time code sent to your registered email. It expires after 10 minutes." :
           step === "pin" ? "After the email code is verified, confirm the six-digit PIN you created for this account." :
           "Your email and existing PIN have been verified. Choose a new password to finish recovery."}
        </p>

        {message ? <p className="mt-5 rounded-xl border border-orange-400/20 bg-orange-400/[0.07] p-3 text-sm text-orange-100">{message}</p> : null}

        {step === "email" ? (
          <form className="mt-8 space-y-5" onSubmit={requestCode}>
            <label className="block text-sm text-slate-300">
              Registered Gmail address
              <input
                autoComplete="email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400"
                placeholder="you@example.com"
              />
            </label>
            {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:opacity-60">
              {busy ? "Checking account…" : "Send recovery code"}
            </button>
          </form>
        ) : null}

        {step === "code" ? (
          <form className="mt-8 space-y-5" onSubmit={verifyCode}>
            <label className="block text-sm text-slate-300">
              Six-digit email code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                type="text"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-center text-2xl tracking-[0.45em] text-white outline-none transition focus:border-orange-400"
                placeholder="••••••"
              />
            </label>
            {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
            <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:opacity-60">
              {busy ? "Verifying code…" : "Verify email code"}
            </button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); setMessage(""); }} className="w-full text-sm text-slate-400 hover:text-white">Use a different email address</button>
          </form>
        ) : null}

        {step === "pin" ? (
          <form className="mt-8 space-y-5" onSubmit={verifyPin}>
            <label className="block text-sm text-slate-300">
              Your six-digit account PIN
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
            <button type="submit" disabled={busy || pin.length !== 6} className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:opacity-60">
              {busy ? "Verifying PIN…" : "Verify PIN"}
            </button>
          </form>
        ) : null}

        {step === "password" ? (
          <form className="mt-8 space-y-5" onSubmit={changePassword}>
            <label className="block text-sm text-slate-300">
              New password
              <input
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                minLength={12}
                maxLength={128}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400"
                placeholder="12–128 characters"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Confirm new password
              <input
                autoComplete="new-password"
                type={showPassword ? "text" : "password"}
                minLength={12}
                maxLength={128}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-white outline-none transition focus:border-orange-400"
                placeholder="Enter the same password again"
              />
            </label>
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="text-sm font-semibold text-orange-400 hover:text-orange-300">
              {showPassword ? "Hide passwords" : "Show passwords"}
            </button>
            <p className="text-xs text-slate-500">After the password is changed, your other sessions are revoked and this browser is signed in to your dashboard.</p>
            {error ? <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-[#17100a] transition hover:bg-orange-400 disabled:opacity-60">
              {busy ? "Changing password…" : "Change password and continue"}
            </button>
          </form>
        ) : null}

        <p className="mt-7 text-sm text-slate-400">
          Remembered your details? <Link href="/sign-in" className="font-semibold text-orange-400 hover:text-orange-300">Back to sign in</Link>
        </p>
      </section>
    </main>
  );
}
