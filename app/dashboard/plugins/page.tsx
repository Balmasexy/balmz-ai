import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { PluginWorkspace } from "./plugin-workspace";

export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const [isAdmin, subscription] = await Promise.all([
    isAdminUser(session.user.id),
    getCurrentSubscription(session.user.id),
  ]);
  return <PluginWorkspace isAdmin={isAdmin} planName={subscription?.plan_name ?? null} />;
}
