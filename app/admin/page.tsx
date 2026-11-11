import { redirect } from "next/navigation";
import { getAdminOverview, getAdminSession } from "@/lib/admin";
import { AdminWorkspace } from "./admin-workspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/dashboard");

  const data = await getAdminOverview();

  return <AdminWorkspace data={data} adminEmail={session.user.email} />;
}
