import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/app/components/sign-out-button";
import { getAuth } from "@/lib/auth";
import { getCurrentSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const isAdmin = (session.user as { role?: string }).role === "admin";

  const subscription = await getCurrentSubscription(session.user.id);

  return (
    <main className="min-h-screen bg-[#080c14] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <Link href="/" className="text-sm font-bold tracking-[0.2em] text-orange-400">BALMZ AI</Link>
          <div className="flex items-center gap-4">{isAdmin && <Link href="/admin" className="rounded-lg border border-orange-400/30 px-3 py-2 text-sm font-medium text-orange-300 hover:bg-orange-400/10">Super Admin</Link>}<SignOutButton /></div>
        </header>

        <section className="py-10">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-400">Your workspace</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome, {session.user.name}</h1>
          <p className="mt-2 text-slate-400">{session.user.email}</p>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-lg font-semibold">Account security</h2>
            <p className="mt-2 text-sm text-slate-400">Your account is authenticated with a server-managed session.</p>
            <p className="mt-5 text-sm text-emerald-300">Session active</p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-lg font-semibold">Subscription</h2>
            {subscription ? (
              <>
                <p className="mt-3 text-2xl font-semibold">{subscription.plan_name}</p>
                <p className="mt-1 text-sm capitalize text-slate-400">Status: {subscription.status.replaceAll("_", " ")}</p>
              </>
            ) : (
              <>
                <p className="mt-3 text-base font-medium text-slate-200">No subscription assigned</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">Your account is ready. Plans and usage allowances will appear here once they are configured.</p>
              </>
            )}
            <p className="mt-5 text-xs text-slate-500">Paid features remain locked until a verified billing flow is enabled.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
