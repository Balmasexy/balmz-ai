import { redirect } from "next/navigation";

export default function DeploymentsPage() {
  redirect("/admin?section=deployments");
}
