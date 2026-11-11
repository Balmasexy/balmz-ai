"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#080d15] px-5 py-12 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1420] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] text-xl text-rose-300">!</div>
        <p className="mt-6 text-[10px] font-bold tracking-[0.2em] text-orange-300">BALMZ AI · SUPER ADMIN</p>
        <h1 className="mt-3 text-2xl font-semibold">The admin workspace could not load</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">The live admin data request failed. No account, payment or subscription data has been changed. Retry the page or return to your workspace.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-[#17100a] hover:bg-orange-600">Retry workspace</button>
          <a href="/dashboard" className="rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-white/5">User workspace</a>
        </div>
      </section>
    </main>
  );
}
