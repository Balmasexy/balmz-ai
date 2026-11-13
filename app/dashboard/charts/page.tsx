import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { ChartGPTWorkspace } from "./chartgpt-workspace";

export const dynamic = "force-dynamic";

export default async function ChartsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const isAdmin = await isAdminUser(session.user.id);
  return <ChartGPTWorkspace isAdmin={isAdmin} />;
}
