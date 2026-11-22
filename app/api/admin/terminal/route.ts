import { NextResponse } from "next/server";
import { getAdminOverview, getAdminSession } from "@/lib/admin";
import { getRenderApiToken } from "@/lib/render-api";
import { getNeonApiToken, neonApiRequest } from "@/lib/neon-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HELP =
  "Available commands: help, helper, capacitor, whoami, pwd, ls, overview, users, plans, subscriptions, payments, usage, webhooks, audit, security, deployments, neon. Commands are read-only. helper gives deployment guidance; capacitor reports the configured native wrapper. deployments and neon read provider metadata. No shell, arbitrary SQL, scripts, files, or secrets are accessible.";

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
  if (command === "helper") {
    return NextResponse.json({
      output: [
        "BALMZ AI DEPLOYMENT HELPER",
        "1. Open Deployment Workplace and select the intended Render service. Confirm its repository, branch, region and current public URL.",
        "2. For a new URL, use Domains and follow the exact DNS records returned by Render. Adding a domain does not register it or change DNS.",
        "3. For Neon, select the intended project, branch, database and a SQL-created least-privilege application login role. Roles created through the Neon Console/API/CLI inherit neon_superuser privileges and are blocked for runtime DATABASE_URL.",
        "4. Test the database connection. BALMZ AI writes only DATABASE_URL after the connection and privilege checks pass; it does not run migrations or deploy automatically.",
        "5. Review the result before explicitly choosing Deploy latest. Deployment starts a real Render build and may consume provider resources.",
        "For AI guidance, use the floating Quick Chat helper. Type capacitor for mobile wrapper diagnostics."
      ].join("\n")
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "capacitor") {
    return NextResponse.json({
      output: [
        "BALMZ AI CAPACITOR CONFIGURATION",
        "Wrapper: Capacitor 8",
        "Android application ID: com.balmz.ai",
        "Display name: BALMZ AI",
        "Production web origin: https://balmz-ai.onrender.com",
        "Native bridge: loaded from app/layout.tsx; runtime bridge handles Android back navigation, app lifecycle, connectivity and keyboard events.",
        "Native helpers: confirmation dialogs, haptics, clipboard, browser, camera, device/network info, filesystem, preferences, notifications, sharing, status bar and toast.",
        "Android CI: .github/workflows/android-build.yml builds APK/AAB on pull requests, main pushes and manual dispatch.",
        "The live platform and connectivity detected by this device are shown in the Capacitor panel beside this terminal. This command reports configured project metadata; it does not claim a physical-device test or a signed Play Store release."
      ].join("\n")
    }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "whoami") {
    return NextResponse.json({ output: `${session.user.email} · role=admin · access=Super Admin` }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "pwd") {
    return NextResponse.json({ output: "/balmz-ai/admin" }, { headers: { "Cache-Control": "no-store" } });
  }
  if (command === "ls") {
    return NextResponse.json({ output: "overview  accounts  plans  subscriptions  payments  usage  webhooks  audit  security  deployments  neon  terminal  settings" }, { headers: { "Cache-Control": "no-store" } });
  }

  if (["deployments", "render"].includes(command)) {
    try {
      const token = await getRenderApiToken();
      const response = await fetch("https://api.render.com/v1/services?limit=100", {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "RENDER_AUTH_FAILED" : "RENDER_LOOKUP_FAILED");
      const rows = await response.json() as Array<{ service?: { id: string; name: string; type: string; serviceDetails?: { url?: string } }; id?: string; name?: string; type?: string; serviceDetails?: { url?: string } }>;
      const services = rows.map((row) => row.service ?? row).filter((item) => item.id && item.name).slice(0, 15);
      const output = services.length ? services.map((item) => `${item.name} · ${item.type} · ${item.id} · ${item.serviceDetails?.url ?? "no public URL"}`).join(" | ") : "No Render services returned.";
      return NextResponse.json({ output: `Render services=${services.length} | ${output}` }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = error instanceof Error ? error.message : "RENDER_UNAVAILABLE";
      const output = code === "RENDER_NOT_CONFIGURED" ? "Render is not connected. Connect it in Super Admin → Service connectors." : code === "RENDER_AUTH_FAILED" ? "Render rejected the saved API key. Reconnect the Render connector." : "Render service lookup failed. Check the connector and try again.";
      return NextResponse.json({ output }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }

  if (command === "neon") {
    try {
      const token = await getNeonApiToken();
      const data = await neonApiRequest<{ projects?: Array<{ id: string; name: string; region_id?: string; pg_version?: number }> }>(token, "/projects?limit=100");
      const projects = Array.isArray(data.projects) ? data.projects.slice(0, 15) : [];
      const output = projects.length ? projects.map((item) => `${item.name} · ${item.id} · ${item.region_id ?? "region unavailable"} · PostgreSQL ${item.pg_version ?? "version unavailable"}`).join(" | ") : "No Neon projects returned.";
      return NextResponse.json({ output: `Neon projects=${projects.length} | ${output}` }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = error instanceof Error ? error.message : "NEON_UNAVAILABLE";
      const output = code === "NEON_NOT_CONFIGURED" ? "Neon is not connected. Connect it in Super Admin → Service connectors." : code === "NEON_AUTH_FAILED" ? "Neon rejected the saved API key. Reconnect the Neon connector." : "Neon project lookup failed. Check the connector and try again.";
      return NextResponse.json({ output }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
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
          ? data.users.slice(0, 10).map((user) => `${user.email} · role=${user.role} · verified=${user.emailVerified ? "yes" : "no"}`).join("\n")
          : "No registered user accounts.";
        break;
      case "plans":
        output = data.plans.length
          ? data.plans.map((plan) => `${plan.code} · ${plan.display_name} · ${plan.is_enabled ? "enabled" : "disabled"}`).join("\n")
          : "No subscription plans are configured.";
        break;
      case "subscriptions":
        output = data.subscriptions.length
          ? data.subscriptions.slice(0, 10).map((item) => `${item.email} · ${item.plan_name} · ${item.status}`).join("\n")
          : "No subscription records.";
        break;
      case "payments":
        output = `records=${safeNumber(data.totals.payment_records)} · successful=${safeNumber(data.totals.successful_payments)} · pending=${safeNumber(data.totals.pending_payments)} · payment_operations=disabled`;
        break;
      case "usage":
        output = data.usage.length
          ? data.usage.slice(0, 10).map((item) => `${item.email} · ${item.metric} · used=${safeNumber(item.units_used)} · limit=${item.units_limit == null ? "not-set" : safeNumber(item.units_limit)} · updated=${displayDate(item.updated_at)}`).join("\n")
          : "No usage counters recorded.";
        break;
      case "webhooks":
        output = data.webhooks.length
          ? data.webhooks.slice(0, 10).map((event) => `${event.provider} · ${event.event_type} · ${event.processing_status} · ${displayDate(event.received_at)}`).join("\n")
          : "No billing webhook events recorded.";
        break;
      case "audit":
        output = data.audit.length
          ? data.audit.slice(0, 10).map((event) => `${event.action} · actor=${event.actor_email || "system"} · ${displayDate(event.created_at)}`).join("\n")
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
