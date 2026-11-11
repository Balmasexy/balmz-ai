import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { PinSetupForm } from "./pin-setup-form";

export const dynamic = "force-dynamic";

export default async function CreatePinPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const pin = await getDbPool().query(
    "SELECT 1 FROM public.balmz_auth_pins WHERE user_id = $1 LIMIT 1",
    [session.user.id],
  );
  if (pin.rowCount) redirect("/dashboard");

  return <PinSetupForm email={session.user.email} />;
}
