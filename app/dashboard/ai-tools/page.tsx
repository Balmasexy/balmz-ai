import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { AiToolsWorkspace } from "./ai-tools-workspace";

export const dynamic = "force-dynamic";

export default async function AiToolsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=%2Fdashboard%2Fai-tools");
  return <AiToolsWorkspace />;
}
