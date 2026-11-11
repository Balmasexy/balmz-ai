import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { DeploymentWorkplace } from "./deployment-workplace";

export const dynamic = "force-dynamic";

export default async function DeploymentsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (!(await isAdminUser(session.user.id))) redirect("/dashboard");
  return <DeploymentWorkplace />;
}
