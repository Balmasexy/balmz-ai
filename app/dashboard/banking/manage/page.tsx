import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { ManageBankConnections } from "./manage-workspace";

export const dynamic = "force-dynamic";

export default async function ManageBankPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return <ManageBankConnections />;
}
