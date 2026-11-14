import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { CampaignStudioWorkspace } from "./campaign-studio-workspace";

export const dynamic = "force-dynamic";

export default async function CampaignStudioPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const isAdmin = await isAdminUser(session.user.id);

  return (
    <main className="min-h-[100dvh] bg-[#080c14] text-slate-100">
      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-3 border-b border-white/[0.07] bg-[#080c14]/95 px-4 backdrop-blur-xl sm:px-8">
        <div>
          <p className="text-sm font-semibold text-white">BALMZ AI · Campaign Studio</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Campaign concepts, channel copy and launch planning</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? <Link href="/admin?section=ai-connections" className="hidden min-h-10 items-center rounded-xl border border-[var(--balmz-orange)]/30 px-3 py-2 text-xs font-semibold text-[var(--balmz-orange)] sm:inline-flex">AI Connections</Link> : null}
          <Link href="/dashboard" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white">← Back to Chat</Link>
        </div>
      </header>
      <CampaignStudioWorkspace />
    </main>
  );
}
