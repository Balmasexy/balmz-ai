"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@/app/components/sign-out-button";
import type { AdminOverview, CountValue } from "@/lib/admin";

type Section =
  | "overview"
  | "accounts"
  | "plans"
  | "subscriptions"
  | "payments"
  | "usage"
  | "webhooks"
  | "audit"
  | "terminal"
  | "settings";

type NavigationItem = {
  id: Section;
  label: string;
  icon: string;
  detail: string;
};

const navigation: { title: string; items: NavigationItem[] }[] = [
  {
    title: "WORKSPACE",
    items: [
      { id: "overview", label: "Overview", icon: "◫", detail: "Live platform overview" },
      { id: "accounts", label: "User accounts", icon: "◎", detail: "Identity and access" },
      { id: "plans", label: "Plan catalog", icon: "◇", detail: "Configured subscription plans" },
      { id: "subscriptions", label: "Subscriptions", icon: "▤", detail: "Account entitlements" },
    ],
  },
  {
    title: "MONITORING",
    items: [
      { id: "payments", label: "Payments", icon: "₦", detail: "Payment records" },
      { id: "usage", label: "Usage analytics", icon: "⌁", detail: "Tracked usage counters" },
      { id: "webhooks", label: "Webhook events", icon: "⇄", detail: "Billing event processing" },
      { id: "audit", label: "Audit trail", icon: "◷", detail: "Administrative history" },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { id: "terminal", label: "Admin terminal", icon: "›_", detail: "Restricted diagnostics console" },
      { id: "settings", label: "System settings", icon: "⚙", detail: "Security and service posture" },
    ],
  },
];

const titles: Record<Section, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "COMMAND CENTER", title: "Platform overview", description: "A live view of your BALMZ AI operations and account activity." },
  accounts: { eyebrow: "IDENTITY", title: "User accounts", description: "Review registered accounts, account roles and verification status." },
  plans: { eyebrow: "BILLING CONFIGURATION", title: "Plan catalog", description: "Inspect the plans currently stored in the BALMZ AI database." },
  subscriptions: { eyebrow: "CUSTOMER ENTITLEMENTS", title: "Subscriptions", description: "Review subscription assignments and their current lifecycle state." },
  payments: { eyebrow: "FINANCIAL RECORDS", title: "Payment records", description: "Inspect recorded transactions. Payment initiation and settlement controls are not enabled." },
  usage: { eyebrow: "CONSUMPTION", title: "Usage analytics", description: "Review real usage counters and limits recorded by the application." },
  webhooks: { eyebrow: "INTEGRATION EVENTS", title: "Webhook monitor", description: "Inspect Paystack webhook events and their processing state." },
  audit: { eyebrow: "GOVERNANCE", title: "Audit trail", description: "Review administrative actions recorded for accountability." },
  terminal: { eyebrow: "OPERATIONS CONSOLE", title: "Admin terminal", description: "Run built-in, read-only BALMZ AI diagnostics." },
  settings: { eyebrow: "PLATFORM CONTROL", title: "System settings", description: "Review service configuration and protected capabilities." },
};

function count(value: CountValue | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-NG");
}

function date(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function money(value: CountValue | null, currency: string): string {
  const amount = Number(value ?? 0) / 100;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "NGN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "—"} ${amount.toLocaleString("en-NG")}`;
  }
}

function statusStyle(status: string): string {
  const value = status.toLowerCase();
  if (["active", "success", "processed", "verified", "enabled"].includes(value)) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (["pending", "received", "trialing", "incomplete"].includes(value)) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }
  if (["failed", "canceled", "expired", "reversed", "disabled"].includes(value)) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function Status({ value }: { value: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusStyle(value)}`}>{value.replaceAll("_", " ")}</span>;
}

function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420]/90 shadow-[0_18px_60px_rgba(0,0,0,0.16)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-white">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-6 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-lg text-slate-500">—</span>
      <p className="mt-3 text-sm font-medium text-slate-300">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function Table({ children }: { children: ReactNode }) {
  return <table className="w-full min-w-[680px] border-collapse text-left text-sm">{children}</table>;
}

function TableHead({ labels }: { labels: string[] }) {
  return (
    <thead className="bg-white/[0.025] text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      <tr>{labels.map((label) => <th key={label} className="whitespace-nowrap px-5 py-3.5">{label}</th>)}</tr>
    </thead>
  );
}

function TableRow({ children }: { children: ReactNode }) {
  return <tr className="border-t border-white/[0.055] transition hover:bg-white/[0.025]">{children}</tr>;
}

function Cell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-5 py-3.5 text-slate-300 ${className}`}>{children}</td>;
}

function MetricCard({
  label,
  value,
  sub,
  icon,
  accent = "orange",
}: {
  label: string;
  value: CountValue;
  sub: string;
  icon: string;
  accent?: "orange" | "green" | "blue" | "purple";
}) {
  const accents = {
    orange: "border-orange-400/20 bg-orange-400/[0.07] text-orange-300",
    green: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    blue: "border-sky-400/20 bg-sky-400/[0.07] text-sky-300",
    purple: "border-violet-400/20 bg-violet-400/[0.07] text-violet-300",
  };
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1420] p-5 transition hover:-translate-y-0.5 hover:border-white/[0.15] hover:bg-[#101a29]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm ${accents[accent]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums text-white">{count(value)}</p>
      <p className="mt-1.5 text-[11px] text-slate-500">{sub}</p>
      <div className="pointer-events-none absolute -bottom-8 -right-5 h-24 w-24 rounded-full bg-orange-400/[0.035] blur-2xl" />
    </article>
  );
}

function OverviewSection({ data, onNavigate }: { data: AdminOverview; onNavigate: (section: Section) => void }) {
  const latestAudit = data.audit.slice(0, 5);
  const quickLinks: Array<{ section: Section; title: string; detail: string; icon: string }> = [
    { section: "accounts", title: "Manage accounts", detail: "Review users and access roles", icon: "◎" },
    { section: "plans", title: "Plan catalog", detail: "Inspect configured plans", icon: "◇" },
    { section: "payments", title: "Payment monitoring", detail: "Read transaction records", icon: "₦" },
    { section: "terminal", title: "Open admin terminal", detail: "Use restricted diagnostics", icon: "›_" },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Registered accounts" value={data.totals.users} sub={`${count(data.totals.verified_users)} verified email addresses`} icon="◎" accent="orange" />
        <MetricCard label="Super Admins" value={data.totals.admins} sub="Privileged accounts in the database" icon="♙" accent="purple" />
        <MetricCard label="Active subscriptions" value={data.totals.active_subscriptions} sub="Active or trialing records" icon="▤" accent="green" />
        <MetricCard label="Successful payments" value={data.totals.successful_payments} sub="Recorded successful transactions" icon="₦" accent="blue" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <Panel title="Operations snapshot" subtitle="Live counts from the BALMZ AI database">
          <div className="grid grid-cols-2 sm:grid-cols-3">
            {[
              ["Payment records", data.totals.payment_records],
              ["Pending payments", data.totals.pending_payments],
              ["Usage events", data.totals.usage_events],
              ["Plan catalog", data.plans.length],
              ["Webhook attention", data.totals.pending_webhooks],
              ["Audit entries", data.audit.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="border-b border-r border-white/[0.055] px-5 py-5 last:border-r-0 sm:px-6">
                <p className="text-[11px] text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">{count(value as CountValue)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-5 py-4 sm:px-6">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
            <p className="text-xs text-slate-400">Database-backed overview loaded successfully for this session.</p>
          </div>
        </Panel>

        <Panel title="Quick access" subtitle="Common administration workspaces">
          <div className="divide-y divide-white/[0.055]">
            {quickLinks.map((item) => (
              <button key={item.section} type="button" onClick={() => onNavigate(item.section)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.035]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-orange-400/15 bg-orange-400/[0.06] text-sm text-orange-300">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-200">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{item.detail}</span>
                </span>
                <span className="text-slate-600">↗</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Latest administrative activity" subtitle="Most recent entries from the audit log" action={<button type="button" onClick={() => onNavigate("audit")} className="text-xs font-semibold text-orange-300 hover:text-orange-200">View audit trail ↗</button>}>
        {latestAudit.length ? (
          <div className="divide-y divide-white/[0.055]">
            {latestAudit.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-xs text-orange-300">↳</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">{item.action.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.actor_email || "System"}{item.target_email ? ` · ${item.target_email}` : ""}</p>
                </div>
                <p className="text-xs text-slate-500">{date(item.created_at)}</p>
              </div>
            ))}
          </div>
        ) : <EmptyState title="No activity recorded yet" detail="Administrative events will appear here when the system records them." />}
      </Panel>
    </div>
  );
}

function AccountsSection({ data, query }: { data: AdminOverview; query: string }) {
  const filtered = useMemo(() => data.users.filter((user) => [user.name, user.email, user.role].some((value) => value.toLowerCase().includes(query.toLowerCase()))), [data.users, query]);
  return (
    <Panel title="Registered accounts" subtitle={`Showing ${filtered.length} of ${data.users.length} most recent accounts`}>
      {filtered.length ? <TableWrap><Table><TableHead labels={["Account", "Role", "Email verification", "Registered"]} /><tbody>
        {filtered.map((user) => <TableRow key={user.id}>
          <Cell><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-400/20 bg-orange-400/[0.08] text-xs font-bold text-orange-300">{user.name.trim().slice(0, 1).toUpperCase() || "U"}</span><div><p className="font-medium text-slate-200">{user.name}</p><p className="mt-0.5 text-xs text-slate-500">{user.email}</p></div></div></Cell>
          <Cell><Status value={user.role} /></Cell>
          <Cell><Status value={user.emailVerified ? "verified" : "unverified"} /></Cell>
          <Cell className="text-xs text-slate-500">{date(user.createdAt)}</Cell>
        </TableRow>)}
      </tbody></Table></TableWrap> : <EmptyState title="No matching accounts" detail="Try another search term or check back when accounts have registered." />}
      <div className="border-t border-white/[0.055] px-5 py-3 text-[11px] text-slate-500">This release is read-only. Role changes and account suspension are not exposed as unreviewed actions.</div>
    </Panel>
  );
}

function PlansSection({ data }: { data: AdminOverview }) {
  return (
    <Panel title="Configured subscription plans" subtitle={`${data.plans.length} plan records found in Neon`}>
      {data.plans.length ? <TableWrap><Table><TableHead labels={["Plan", "Code", "Price", "Billing", "Visibility", "State"]} /><tbody>
        {data.plans.map((plan) => <TableRow key={plan.id}>
          <Cell><p className="font-medium text-slate-200">{plan.display_name}</p><p className="mt-0.5 max-w-xs truncate text-xs text-slate-500">{plan.description || "No description"}</p></Cell>
          <Cell className="font-mono text-xs">{plan.code}</Cell>
          <Cell>{plan.price_minor == null || !plan.currency ? "Not configured" : money(plan.price_minor, plan.currency)}</Cell>
          <Cell className="capitalize">{plan.billing_interval?.replaceAll("_", " ") || "—"}</Cell>
          <Cell>{plan.is_public ? "Public" : "Private"}</Cell>
          <Cell><Status value={plan.is_enabled ? "enabled" : "disabled"} /></Cell>
        </TableRow>)}
      </tbody></Table></TableWrap> : <EmptyState title="No subscription plans configured" detail="No plan prices or entitlements are seeded. This dashboard does not invent plan values or activate billing." />}
    </Panel>
  );
}

function SubscriptionsSection({ data }: { data: AdminOverview }) {
  return (
    <Panel title="Subscription records" subtitle={`Latest ${data.subscriptions.length} subscription assignments`}>
      {data.subscriptions.length ? <TableWrap><Table><TableHead labels={["Account", "Plan", "Status", "Billing provider", "Period ends"]} /><tbody>
        {data.subscriptions.map((item) => <TableRow key={item.id}>
          <Cell><p className="text-slate-200">{item.user_name}</p><p className="mt-0.5 text-xs text-slate-500">{item.email}</p></Cell>
          <Cell>{item.plan_name}</Cell>
          <Cell><Status value={item.status} /></Cell>
          <Cell className="capitalize">{item.billing_provider || "—"}</Cell>
          <Cell className="text-xs text-slate-500">{date(item.current_period_ends_at)}</Cell>
        </TableRow>)}
      </tbody></Table></TableWrap> : <EmptyState title="No subscription records yet" detail="Subscription assignments will appear when a verified plan and billing flow are available." />}
    </Panel>
  );
}

function PaymentsSection({ data }: { data: AdminOverview }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Payment records" value={data.totals.payment_records} sub="All stored records" icon="▤" />
        <MetricCard label="Successful" value={data.totals.successful_payments} sub="Database status: success" icon="✓" accent="green" />
        <MetricCard label="Pending" value={data.totals.pending_payments} sub="Awaiting provider verification" icon="◷" accent="blue" />
      </div>
      <Panel title="Payment ledger" subtitle="Latest stored records · no payment operations are available">
        {data.payments.length ? <TableWrap><Table><TableHead labels={["Account / reference", "Provider", "Amount", "Status", "Created"]} /><tbody>
          {data.payments.map((item) => <TableRow key={item.id}>
            <Cell><p className="text-slate-200">{item.email}</p><p className="mt-0.5 max-w-56 truncate font-mono text-[10px] text-slate-500">{item.provider_reference}</p></Cell>
            <Cell className="capitalize">{item.provider}</Cell>
            <Cell>{money(item.amount_minor, item.currency)}</Cell>
            <Cell><Status value={item.status} /></Cell>
            <Cell className="text-xs text-slate-500">{date(item.created_at)}</Cell>
          </TableRow>)}
        </tbody></Table></TableWrap> : <EmptyState title="No payment records" detail="There are no recorded transactions. Paystack remains disabled until its verified integration is approved." />}
      </Panel>
    </div>
  );
}

function UsageSection({ data }: { data: AdminOverview }) {
  return (
    <Panel title="Usage counters" subtitle="Actual metric counters and configured limits">
      {data.usage.length ? <TableWrap><Table><TableHead labels={["Account", "Metric", "Units used", "Limit", "Period ends", "Updated"]} /><tbody>
        {data.usage.map((item, index) => {
          const used = Number(item.units_used);
          const limit = item.units_limit == null ? null : Number(item.units_limit);
          const ratio = limit && limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
          return <TableRow key={item.user_id + item.metric + index}>
            <Cell>{item.email}</Cell>
            <Cell className="font-mono text-xs">{item.metric}</Cell>
            <Cell className="tabular-nums">{count(item.units_used)}</Cell>
            <Cell>{item.units_limit == null ? "Not set" : count(item.units_limit)}</Cell>
            <Cell className="text-xs text-slate-500">{date(item.period_end)}</Cell>
            <Cell className="text-xs text-slate-500">{date(item.updated_at)}</Cell>
            <td className="hidden px-5 py-3 lg:table-cell"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-400" style={{ width: `${ratio}%` }} /></div></td>
          </TableRow>;
        })}
      </tbody></Table></TableWrap> : <EmptyState title="No usage counters yet" detail="The dashboard will show usage when BALMZ AI records tracked activity. No usage totals are fabricated." />}
    </Panel>
  );
}

function WebhooksSection({ data }: { data: AdminOverview }) {
  return (
    <Panel title="Billing webhook events" subtitle={`${data.webhooks.length} latest provider events`}>
      {data.webhooks.length ? <TableWrap><Table><TableHead labels={["Provider event", "Event type", "Processing", "Received", "Processed", "Error code"]} /><tbody>
        {data.webhooks.map((event) => <TableRow key={event.id}>
          <Cell><p className="capitalize text-slate-200">{event.provider}</p><p className="mt-0.5 max-w-44 truncate font-mono text-[10px] text-slate-500">{event.provider_event_id}</p></Cell>
          <Cell>{event.event_type}</Cell>
          <Cell><Status value={event.processing_status} /></Cell>
          <Cell className="text-xs text-slate-500">{date(event.received_at)}</Cell>
          <Cell className="text-xs text-slate-500">{date(event.processed_at)}</Cell>
          <Cell className="text-xs text-rose-300">{event.error_code || "—"}</Cell>
        </TableRow>)}
      </tbody></Table></TableWrap> : <EmptyState title="No webhook events" detail="Provider events will appear here after a verified billing webhook integration is enabled." />}
    </Panel>
  );
}

function AuditSection({ data }: { data: AdminOverview }) {
  return (
    <Panel title="Administrative audit history" subtitle={`Latest ${data.audit.length} recorded events`}>
      {data.audit.length ? <TableWrap><Table><TableHead labels={["Action", "Actor", "Target", "Recorded details", "Timestamp"]} /><tbody>
        {data.audit.map((item) => <TableRow key={item.id}>
          <Cell><span className="font-medium capitalize text-slate-200">{item.action.replaceAll("_", " ")}</span></Cell>
          <Cell>{item.actor_email || "System"}</Cell>
          <Cell>{item.target_email || "—"}</Cell>
          <Cell><span className="block max-w-[280px] truncate font-mono text-[10px] text-slate-500">{JSON.stringify(item.metadata)}</span></Cell>
          <Cell className="text-xs text-slate-500">{date(item.created_at)}</Cell>
        </TableRow>)}
      </tbody></Table></TableWrap> : <EmptyState title="No administrative events" detail="Actions recorded by the Super Admin system will appear here." />}
    </Panel>
  );
}

type TerminalLine = { id: number; text: string; kind: "input" | "output" | "error" | "system" };

function TerminalSection({ data, email }: { data: AdminOverview; email: string }) {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<TerminalLine[]>([
    { id: 1, kind: "system", text: "BALMZ AI CONTROL CONSOLE · restricted read-only mode" },
    { id: 2, kind: "system", text: "Type help to view available commands. This console does not execute operating-system shell commands." },
  ]);

  function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = command.trim();
    if (!input) return;
    const nextId = Date.now();
    const base: TerminalLine[] = [...lines, { id: nextId, kind: "input", text: `admin@balmz-ai:~$ ${input}` }];
    const [name, ...args] = input.toLowerCase().split(/\s+/);
    const hasArgs = args.length > 0;
    let response = "";
    let kind: TerminalLine["kind"] = "output";

    switch (name) {
      case "help":
        response = "Available: help, clear, whoami, pwd, ls, overview, users, plans, subscriptions, payments, usage, webhooks, audit, security, status. Commands are read-only and operate on dashboard data only.";
        break;
      case "clear":
        setLines([{ id: nextId + 1, kind: "system", text: "Console cleared. Type help to view commands." }]);
        setCommand("");
        return;
      case "whoami":
        response = `${email} · role=admin · access=Super Admin`;
        break;
      case "pwd":
        response = "/balmz-ai/admin";
        break;
      case "ls":
        response = "overview  accounts  plans  subscriptions  payments  usage  webhooks  audit  terminal  settings";
        break;
      case "overview":
      case "status":
        response = `accounts=${count(data.totals.users)} admins=${count(data.totals.admins)} active_subscriptions=${count(data.totals.active_subscriptions)} payment_records=${count(data.totals.payment_records)} usage_events=${count(data.totals.usage_events)} open_webhooks=${count(data.totals.pending_webhooks)}`;
        break;
      case "users":
        response = `Registered accounts: ${count(data.totals.users)} · verified: ${count(data.totals.verified_users)} · admin roles: ${count(data.totals.admins)}. Use the User accounts section for the latest records.`;
        break;
      case "plans":
        response = data.plans.length ? data.plans.map((plan) => `${plan.code}: ${plan.display_name} · ${plan.is_enabled ? "enabled" : "disabled"}`).join(" | ") : "No subscription plans are configured in Neon.";
        break;
      case "subscriptions":
        response = `Stored subscription rows in current view: ${data.subscriptions.length}; active/trialing total: ${count(data.totals.active_subscriptions)}.`;
        break;
      case "payments":
        response = `Stored payment records: ${count(data.totals.payment_records)} · successful: ${count(data.totals.successful_payments)} · pending: ${count(data.totals.pending_payments)}. Payment operations are disabled.`;
        break;
      case "usage":
        response = `Usage counter rows loaded: ${data.usage.length} · total usage events: ${count(data.totals.usage_events)}.`;
        break;
      case "webhooks":
        response = `Webhook events loaded: ${data.webhooks.length} · received/failed attention count: ${count(data.totals.pending_webhooks)}.`;
        break;
      case "audit":
        response = data.audit.length ? data.audit.slice(0, 5).map((event) => `${event.action} @ ${date(event.created_at)}`).join(" | ") : "No audit events are recorded.";
        break;
      case "security":
        response = "Admin route: session-protected · role check: live Neon lookup · data access: read-only · host shell: blocked · payment actions: disabled · database secrets: never exposed.";
        break;
      default:
        response = hasArgs ? `Unknown or unsupported command: ${name}. Arguments and arbitrary shell execution are not permitted. Type help.` : `Command not found: ${name}. Type help.`;
        kind = "error";
    }

    setLines([...base, { id: nextId + 1, kind, text: response }].slice(-80));
    setCommand("");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <section className="overflow-hidden rounded-2xl border border-emerald-400/15 bg-[#070d12] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] bg-[#0d171b] px-5 py-4">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /><span className="ml-2 font-mono text-xs text-slate-400">balmz-admin — safe console</span></div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Read only</span>
        </div>
        <div className="min-h-[390px] space-y-3 overflow-y-auto px-5 py-5 font-mono text-xs leading-6 sm:px-6" aria-live="polite">
          {lines.map((line) => <p key={line.id} className={line.kind === "input" ? "break-all text-emerald-300" : line.kind === "error" ? "break-words text-rose-300" : line.kind === "system" ? "break-words text-slate-500" : "break-words text-slate-200"}>{line.text}</p>)}
        </div>
        <form onSubmit={runCommand} className="flex items-center gap-3 border-t border-white/[0.07] bg-black/20 px-5 py-4 sm:px-6">
          <span className="font-mono text-sm text-emerald-300">›</span>
          <input aria-label="Admin terminal command" autoComplete="off" spellCheck={false} value={command} onChange={(event) => setCommand(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-slate-600" placeholder="Type help and press Enter…" />
          <button type="submit" className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.14]">Run</button>
        </form>
      </section>
      <div className="space-y-5">
        <Panel title="Command reference" subtitle="Available built-ins">
          <div className="grid grid-cols-2 gap-2 p-4">
            {["help", "whoami", "overview", "users", "plans", "subscriptions", "payments", "usage", "webhooks", "audit", "security", "clear"].map((item) => <button key={item} type="button" onClick={() => setCommand(item)} className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-left font-mono text-[11px] text-slate-300 transition hover:border-emerald-400/20 hover:text-emerald-300">{item}</button>)}
          </div>
        </Panel>
        <Panel title="Isolation policy" subtitle="Console boundaries">
          <div className="space-y-3 p-5 text-xs leading-5 text-slate-400">
            <p><span className="text-emerald-300">✓</span> Reads approved dashboard aggregates</p>
            <p><span className="text-emerald-300">✓</span> Displays current admin identity</p>
            <p><span className="text-rose-300">×</span> No host shell or arbitrary commands</p>
            <p><span className="text-rose-300">×</span> No SQL editor or credential access</p>
            <p><span className="text-rose-300">×</span> No account or payment mutations</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function SettingsSection() {
  const items = [
    ["Application", "BALMZ AI", "Next.js workplace"],
    ["Hosting", "Render", "Production host configured"],
    ["Database", "Neon PostgreSQL", "Dedicated BALMZ AI project"],
    ["Authentication", "Better Auth", "Server-managed sessions"],
    ["Admin authorization", "Live database role", "Checked from Neon on protected requests"],
    ["Payments", "Disabled", "No payment initiation or settlement controls"],
    ["Terminal", "Restricted", "Read-only built-in diagnostics"],
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Service configuration" subtitle="Known application architecture">
        <div className="divide-y divide-white/[0.055]">
          {items.map(([label, value, detail]) => <div key={label} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-medium text-slate-200">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><Status value={label === "Payments" ? "disabled" : "active"} /></div>)}
        </div>
      </Panel>
      <Panel title="Administrative safeguards" subtitle="Controls intentionally retained in this release">
        <div className="space-y-4 p-5 text-sm">
          {[
            ["Server-side administrator check", "Protected routes check the current user role in Neon."],
            ["No fabricated financial figures", "Payment and subscription cards display only stored database records."],
            ["Audit visibility", "Recorded administrative actions are available in the audit section."],
            ["No dangerous terminal access", "The console accepts only documented read-only commands."],
            ["Payment safety", "Payment activation and transaction mutations remain unavailable."],
          ].map(([title, detail]) => <div key={title} className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] text-xs text-emerald-300">✓</span><div><p className="font-medium text-slate-200">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></div>)}
        </div>
      </Panel>
    </div>
  );
}

export function AdminWorkspace({ data, adminEmail }: { data: AdminOverview; adminEmail: string }) {
  const [active, setActive] = useState<Section>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = titles[active];

  function navigate(section: Section) {
    setActive(section);
    setMobileNavOpen(false);
    setQuery("");
  }

  return (
    <main className="min-h-screen bg-[#080d15] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-40 h-[520px] w-[520px] rounded-full bg-orange-500/[0.055] blur-[130px]" />
        <div className="absolute right-0 top-1/3 h-[420px] w-[420px] rounded-full bg-sky-500/[0.035] blur-[130px]" />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="hidden w-[252px] shrink-0 border-r border-white/[0.07] bg-[#0a111c]/95 px-4 py-5 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2 pb-7">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-300 to-orange-600 text-lg font-black text-[#211205] shadow-lg shadow-orange-950/30">B</div>
            <div><p className="text-sm font-bold tracking-[0.17em] text-white">BALMZ AI</p><p className="mt-0.5 text-[9px] font-semibold tracking-[0.2em] text-orange-300">ADMIN WORKPLACE</p></div>
          </div>
          <div className="mb-5 rounded-xl border border-orange-400/15 bg-orange-400/[0.055] px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-orange-300">Workspace access</p>
            <p className="mt-1.5 text-xs font-semibold text-white">Super Administrator</p>
            <p className="mt-1 truncate text-[10px] text-slate-500">{adminEmail}</p>
          </div>
          <nav className="flex-1 space-y-6">
            {navigation.map((group) => <div key={group.title}>
              <p className="mb-2 px-3 text-[9px] font-bold tracking-[0.18em] text-slate-600">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition ${active === item.id ? "border border-orange-400/15 bg-orange-400/[0.09] text-orange-200 shadow-[inset_2px_0_0_0_#fb923c]" : "border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white"}`}>
                  <span className="flex w-5 justify-center text-sm">{item.icon}</span><span className="flex-1">{item.label}</span>{active === item.id ? <span className="h-1.5 w-1.5 rounded-full bg-orange-300" /> : null}
                </button>)}
              </div>
            </div>)}
          </nav>
          <div className="mt-6 border-t border-white/[0.07] pt-4">
            <a href="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-400 transition hover:bg-white/[0.04] hover:text-white"><span>↗</span> User workspace</a>
            <div className="mt-3 rounded-xl bg-white/[0.025] px-3 py-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400" /><p className="text-[10px] text-slate-400">Protected admin session</p></div><p className="mt-1.5 text-[9px] text-slate-600">BALMZ AI · Production</p></div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080d15]/90 backdrop-blur-xl">
            <div className="flex h-[72px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-9">
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setMobileNavOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] text-lg text-slate-200 lg:hidden" aria-label="Toggle navigation">☰</button>
                <div className="lg:hidden"><p className="text-xs font-bold tracking-[0.16em] text-orange-300">BALMZ AI</p><p className="text-[9px] text-slate-500">ADMIN WORKPLACE</p></div>
                <div className="hidden lg:block"><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">Super Admin / <span className="text-orange-300">{current.title}</span></p><p className="mt-1 text-xs text-slate-400">{current.eyebrow}</p></div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 md:flex"><span className="text-xs text-emerald-300">●</span><span className="text-[10px] text-slate-400">Admin session active</span></div>
                <div className="hidden max-w-44 truncate text-right sm:block"><p className="text-[11px] font-semibold text-slate-200">{adminEmail}</p><p className="text-[9px] uppercase tracking-wider text-orange-300">Super Admin</p></div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-orange-400/20 bg-orange-400/[0.08] text-xs font-bold text-orange-200">{adminEmail.slice(0, 1).toUpperCase()}</div>
                <SignOutButton />
              </div>
            </div>
            {mobileNavOpen ? <div className="border-t border-white/[0.07] bg-[#0a111c] px-4 py-4 lg:hidden">
              {navigation.map((group) => <div key={group.title} className="mb-4">
                <p className="mb-2 px-2 text-[9px] font-bold tracking-[0.18em] text-slate-600">{group.title}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.items.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`rounded-xl border px-3 py-3 text-left text-xs ${active === item.id ? "border-orange-400/20 bg-orange-400/[0.08] text-orange-200" : "border-white/[0.07] bg-white/[0.025] text-slate-300"}`}><span className="mr-2">{item.icon}</span>{item.label}</button>)}
                </div>
              </div>)}
            </div> : null}
          </header>

          <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 sm:py-9 xl:px-9">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[10px] font-bold tracking-[0.22em] text-orange-300">{current.eyebrow}</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{current.title}</h1>
                <p className="mt-2 text-sm leading-6 text-slate-400">{current.description}</p>
              </div>
              {active !== "terminal" ? <div className="flex w-full items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0d1420] px-3 py-2.5 sm:w-auto sm:min-w-[250px]"><span className="text-slate-500">⌕</span><input aria-label="Search current records" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={active === "accounts" ? "Search name, email or role…" : "Search user accounts…"} className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></div> : <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.055] px-3 py-2 text-[10px] font-semibold text-emerald-300">SAFE CONSOLE · READ ONLY</div>}
            </div>

            {active === "overview" ? <OverviewSection data={data} onNavigate={navigate} /> : null}
            {active === "accounts" ? <AccountsSection data={data} query={query} /> : null}
            {active === "plans" ? <PlansSection data={data} /> : null}
            {active === "subscriptions" ? <SubscriptionsSection data={data} /> : null}
            {active === "payments" ? <PaymentsSection data={data} /> : null}
            {active === "usage" ? <UsageSection data={data} /> : null}
            {active === "webhooks" ? <WebhooksSection data={data} /> : null}
            {active === "audit" ? <AuditSection data={data} /> : null}
            {active === "terminal" ? <TerminalSection data={data} email={adminEmail} /> : null}
            {active === "settings" ? <SettingsSection /> : null}

            <footer className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[10px] text-slate-600">
              <p>© BALMZ AI · Your Crypto. Your Freedom.</p>
              <p>Protected administration · Live Neon records · No fabricated metrics</p>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
