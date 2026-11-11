import { NextResponse } from "next/server";
import { getAdminOverview, getAdminSession } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HELP =
  "Available commands: help, whoami, pwd, ls, overview, users, plans, subscriptions, payments, usage, webhooks, audit, security. Commands are read-only and query BALMZ AI data only. No shell, SQL, scripts, files, or secrets are accessible.";

function safeNumber(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-NG");
}

function displayDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "FORBIDDEN" }, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const command =
    body && typeof body === "object" && "command" in body &&
    typeof body.command === "string"
      ? body.command.trim().toLowerCase()
      : "";

  if (command.length < 1 || command.length > 24 || !/^[a-z]+$/.test(command)) {
    return NextResponse.json({ error: "COMMAND_NOT_ALLOWED", output: "Only documented built-in commands are allowed. Type help." }, { status: 400 });
  }

  if (command === "help") {
    return NextResponse.json({ output: HELP }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "whoami") {
    return NextResponse.json({ output: `${session.user.email} · role=admin · access=Super Admin` }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "pwd") {
    return NextResponse.json({ output: "/balmz-ai/admin" }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "ls") {
    return NextResponse.json({ output: "overview  accounts  plans  subscriptions  payments  usage  webhooks  audit  terminal  settings" }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!["overview", "status", "users", "plans", "subscriptions", "payments", "usage", "webhooks", "audit", "security"].includes(command)) {
    return NextResponse.json({ error: "COMMAND_NOT_FOUND", output: `Command not found: ${command}. Type help.` }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const data = await getAdminOverview();
    let output = "";

    switch (command) {
      case "overview":
      case "status":
        output = [
          `accounts=${safeNumber(data.totals.users)}`,
          `admins=${safeNumber(data.totals.admins)}`,
          `active_subscriptions=${safeNumber(data.totals.active_subscriptions)}`,
          `payment_records=${safeNumber(data.totals.payment_records)}`,
          `usage_events=${safeNumber(data.totals.usage_events)}`,
          `open_webhooks=${safeNumber(data.totals.pending_webhooks)}`,
        ].join(" · ");
        break;
      case "users":
        output = data.users.length
          ? data.users.slice(0, 10).map((user) => `${user.email} · role=${user.role} · verified=${user.emailVerified ? "yes" : "no"}`).join("\\n")
          : "No registered user accounts.";
        break;
      case "plans":
        output = data.plans.length
          ? data.plans.map((plan) => `${plan.code} · ${plan.display_name} · ${plan.is_enabled ? "enabled" : "disabled"}`).join("\\n")
          : "No subscription plans are configured.";
        break;
      case "subscriptions":
        output = data.subscriptions.length
          ? data.subscriptions.slice(0, 10).map((item) => `${item.email} · ${item.plan_name} · ${item.status}`).join("\\n")
          : "No subscription records.";
        break;
      case "payments":
        output = `records=${safeNumber(data.totals.payment_records)} · successful=${safeNumber(data.totals.successful_payments)} · pending=${safeNumber(data.totals.pending_payments)} · payment_operations=disabled`;
        break;
      case "usage":
        output = data.usage.length
          ? data.usage.slice(0, 10).map((item) => `${item.email} · ${item.metric} · used=${safeNumber(item.units_used)} · limit=${item.units_limit == null ? "not-set" : safeNumber(item.units_limit)} · updated=${displayDate(item.updated_at)}`).join("\\n")
          : "No usage counters recorded.";
        break;
      case "webhooks":
        output = data.webhooks.length
          ? data.webhooks.slice(0, 10).map((event) => `${event.provider} · ${event.event_type} · ${event.processing_status} · ${displayDate(event.received_at)}`).join("\\n")
          : "No billing webhook events recorded.";
        break;
      case "audit":
        output = data.audit.length
          ? data.audit.slice(0, 10).map((event) => `${event.action} · actor=${event.actor_email || "system"} · ${displayDate(event.created_at)}`).join("\\n")
          : "No administrative audit entries.";
        break;
      case "security":
        output = "admin-route=session-protected · role-check=live-Neon · console=allow-listed · shell=blocked · arbitrary-SQL=blocked · secrets=not-accessible · payment-mutations=disabled";
        break;
      default:
        output = HELP;
    }

    return NextResponse.json({ output }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "TERMINAL_DATA_UNAVAILABLE", output: "The live BALMZ AI data query failed. Retry the command." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
