import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getCurrentSubscription } from "@/lib/subscriptions";
import { ClientWorkplace } from "./client-workplace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const [isAdmin, subscription] = await Promise.all([
    isAdminUser(session.user.id),
    getCurrentSubscription(session.user.id),
  ]);

  return (
    <ClientWorkplace
      userName={session.user.name || "BALMZ AI member"}
      userEmail={session.user.email}
      isAdmin={isAdmin}
      planName={subscription?.plan_name ?? null}
    />
  );
}
