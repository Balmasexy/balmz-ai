import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { BankingWorkspace } from "./banking-workspace";

export const dynamic = "force-dynamic";

export default async function BankingPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <><div className="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 pt-4 sm:px-8"><Link href="/dashboard/banking/ach" className="inline-flex min-h-10 items-center rounded-xl border border-[var(--balmz-orange)]/30 px-4 text-xs font-semibold text-[var(--balmz-orange)]">ACH funding source setup</Link><Link href="/dashboard/banking/manage" className="inline-flex min-h-10 items-center rounded-xl border border-white/10 px-4 text-xs font-semibold text-slate-300">Manage bank connections</Link></div><BankingWorkspace userName={session.user.name || "BALMZ AI member"} /></>;
}
