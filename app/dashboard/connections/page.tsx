import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { ConnectionsWorkspace } from "./connections-workspace";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=%2Fdashboard%2Fconnections");
  return <ConnectionsWorkspace />;
}
