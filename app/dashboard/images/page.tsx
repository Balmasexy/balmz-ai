import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { ImagesWorkspace } from "./images-workspace";

export const dynamic = "force-dynamic";

export default async function ImagesPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=%2Fdashboard%2Fimages");

  return <ImagesWorkspace userName={session.user.name || "BALMZ AI member"} />;
}
