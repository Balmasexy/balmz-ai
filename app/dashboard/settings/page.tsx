import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { isAdminUser } from "@/lib/admin";
import { SettingsWorkspace } from "./settings-workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const [subscription, isAdmin] = await Promise.all([
    getCurrentSubscription(session.user.id),
    isAdminUser(session.user.id),
  ]);
  return <SettingsWorkspace
    name={session.user.name || "BALMZ AI member"}
    email={session.user.email}
    planName={subscription?.plan_name ?? null}
    isAdmin={isAdmin}
  />;
}
