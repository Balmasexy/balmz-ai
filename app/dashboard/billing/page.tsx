import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { BillingWorkspace } from "./billing-workspace";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <BillingWorkspace />;
}
