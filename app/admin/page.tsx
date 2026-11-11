import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/app/components/sign-out-button";
import { getAdminOverview, getAdminSession } from "@/lib/admin";

export const dynamic = "force-dynamic";

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-NG");
}
function date(value: string | Date | null) {
  return value ? new Date(value).toLocaleString("en-NG") : "—";
}
function money(amount: unknown, currency: string) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(amount ?? 0) / 100);
}

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/dashboard");
  const data = await getAdminOverview();
  const cards = [
    ["Registered users", data.totals.users],
    ["Admin accounts", data.totals.admins],
    ["Active subscriptions", data.totals.active_subscriptions],
    ["Successful payments", data.totals.successful_payments],
    ["Payment records", data.totals.payment_records],
    ["Usage events", data.totals.usage_events],
  ];

  return (
    <main className="min-h-screen bg-[#080c14] px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <Link href="/dashboard" className="text-sm font-bold tracking-[0.2em] text-orange-400">BALMZ AI</Link>
            <p className="mt-1 text-xs text-slate-500">SUPER ADMIN CONTROL CENTER</p>
          </div>
          <div className="flex items-center gap-4"><Link href="/dashboard" className="text-sm text-slate-300 hover:text-white">Workspace</Link><SignOutButton /></div>
        </header>

        <section className="py-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-400">Administration</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Super Admin</h1>
          <p className="mt-2 text-sm text-slate-400">Secure, read-only oversight of BALMZ AI accounts, subscriptions, payment records, usage and audit history.</p>
          <p className="mt-3 text-xs text-slate-500">Signed in as {session.user.email}</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{number(value)}</p></article>)}
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">User accounts</h2><p className="mt-1 text-xs text-slate-500">Latest 50 accounts • role and verification status</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-5 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Verified</th><th className="px-5 py-3">Joined</th></tr></thead><tbody>{data.users.map((user: any) => <tr key={user.id} className="border-t border-white/5"><td className="px-5 py-3"><p>{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></td><td className="px-3 py-3 capitalize">{user.role}</td><td className="px-3 py-3">{user.emailVerified ? "Yes" : "No"}</td><td className="px-5 py-3 text-xs text-slate-400">{date(user.createdAt)}</td></tr>)}</tbody></table></div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Subscriptions</h2><p className="mt-1 text-xs text-slate-500">Latest 25 subscription records</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-5 py-3">Account</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Status</th><th className="px-5 py-3">Period ends</th></tr></thead><tbody>{data.subscriptions.map((item: any) => <tr key={item.id} className="border-t border-white/5"><td className="px-5 py-3"><p>{item.user_name}</p><p className="text-xs text-slate-500">{item.email}</p></td><td className="px-3 py-3">{item.plan_name}</td><td className="px-3 py-3 capitalize">{item.status.replaceAll("_", " ")}</td><td className="px-5 py-3 text-xs text-slate-400">{date(item.current_period_ends_at)}</td></tr>)}</tbody></table></div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Payment records</h2><p className="mt-1 text-xs text-slate-500">Stored records only • no payment actions are enabled</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-5 py-3">Account / reference</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-5 py-3">Date</th></tr></thead><tbody>{data.payments.map((item: any) => <tr key={item.id} className="border-t border-white/5"><td className="px-5 py-3"><p>{item.email}</p><p className="max-w-48 truncate text-xs text-slate-500">{item.provider_reference}</p></td><td className="px-3 py-3">{money(item.amount_minor, item.currency)}</td><td className="px-3 py-3 capitalize">{item.status}</td><td className="px-5 py-3 text-xs text-slate-400">{date(item.created_at)}</td></tr>)}</tbody></table></div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Usage monitoring</h2><p className="mt-1 text-xs text-slate-500">Latest 25 user usage counters</p></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-5 py-3">Account / metric</th><th className="px-3 py-3">Used</th><th className="px-3 py-3">Limit</th><th className="px-5 py-3">Updated</th></tr></thead><tbody>{data.usage.map((item: any, index: number) => <tr key={item.user_id + item.metric + index} className="border-t border-white/5"><td className="px-5 py-3"><p>{item.email}</p><p className="text-xs text-slate-500">{item.metric}</p></td><td className="px-3 py-3 tabular-nums">{number(item.units_used)}</td><td className="px-3 py-3 tabular-nums">{item.units_limit == null ? "Not set" : number(item.units_limit)}</td><td className="px-5 py-3 text-xs text-slate-400">{date(item.updated_at)}</td></tr>)}</tbody></table></div>
          </article>
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="border-b border-white/10 px-5 py-4"><h2 className="font-semibold">Administrative audit log</h2><p className="mt-1 text-xs text-slate-500">Latest 25 recorded administrative events</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-slate-500"><tr><th className="px-5 py-3">Action</th><th className="px-3 py-3">Actor</th><th className="px-3 py-3">Target</th><th className="px-3 py-3">Details</th><th className="px-5 py-3">Date</th></tr></thead><tbody>{data.audit.map((item: any) => <tr key={item.id} className="border-t border-white/5"><td className="px-5 py-3">{item.action}</td><td className="px-3 py-3">{item.actor_email || "System"}</td><td className="px-3 py-3">{item.target_email || "—"}</td><td className="max-w-xs truncate px-3 py-3 text-xs text-slate-500">{JSON.stringify(item.metadata)}</td><td className="px-5 py-3 text-xs text-slate-400">{date(item.created_at)}</td></tr>)}</tbody></table></div>
        </section>

        <section className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-400/[0.06] p-5">
          <h2 className="font-semibold text-orange-300">Protected capabilities and rollout status</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">This first control-center release is read-only. User role changes, subscription overrides, usage-limit edits, Paystack activation and terminal execution remain disabled until their dedicated validation, audit and approval workflows are implemented. No payment is initiated and no balance is modified here.</p>
        </section>
      </div>
    </main>
  );
}
