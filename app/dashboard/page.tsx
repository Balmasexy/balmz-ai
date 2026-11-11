import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { WorkspaceClient } from "./workspace-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const isAdmin = await isAdminUser(session.user.id);

  return (
    <WorkspaceClient
      userName={session.user.name || "BALMZ AI user"}
      userEmail={session.user.email}
      isAdmin={isAdmin}
    />
  );
}
