# Deployment Workplace

The authenticated Super Admin Deployment Workplace is available inside **Super Admin → Deployment Workplace**. The legacy `/dashboard/deployments` route redirects to that protected admin section.

## Implemented Render controls

The workplace lists up to 50 services visible to the connected Render account and displays each service's latest deployment and provider-returned public URL. For a selected service it can:

- Trigger a real Render build-and-deploy, with build-cache clearing available only when explicitly selected.
- Inspect deployment history and lifecycle events.
- Retrieve recent application and build log entries (this is a refresh-based view, not a live streaming terminal).
- Inspect returned CPU, memory and instance metrics.
- List the provider-returned primary URL and custom domains.
- Add a custom domain to a Render web service or static site.

A domain is not registered or paid for by BALMZ AI. Adding it in Render does not change DNS; apply the exact DNS records shown by Render, then refresh until Render reports the domain verified. The original `.onrender.com` address remains available unless its Render service subdomain policy is separately changed. BALMZ AI does not invent preview URLs.

## Neon Postgres connection

The Neon tab lists projects, branches, databases and roles available to the connected Neon account. For a selected target it:

1. Verifies the selected Render service belongs to the connected Render account.
2. Verifies that the project, branch, database and role belong to the connected Neon account.
3. Requests the selected Neon pooled connection URI server-side and validates the URI host and TLS settings.
4. Opens a server-side PostgreSQL connection and runs `SELECT 1`.
5. Updates only the selected Render service's `DATABASE_URL` using Render's single-variable endpoint.

The URI is never returned to the browser or written to application logs. Other Render environment variables are not replaced. If `DATABASE_URL` already exists, the admin must explicitly select the replacement option and confirm the action. The environment change does not automatically deploy the service; review the selected project, branch, database and restricted runtime role, then explicitly trigger **Deploy latest**.

Use the restricted application role for production runtime traffic, not a Neon owner or migration role. This workflow does not create projects, branches, databases or roles; it does not run schema migrations, alter tables, reset passwords or edit arbitrary environment variables.

## Credentials and costs

Render and Neon management credentials are resolved server-side from a tested, encrypted **Super Admin → Service connectors** record or from the respective Render service environment fallback (`RENDER_API_KEY` and `NEON_API_KEY`). A configured credential is never sent to the browser. The integration displays only provider resource metadata and non-secret status.

Build minutes, hosting plans, storage, bandwidth and provider usage may incur charges or be subject to free-tier quotas. A deployment request starts a real provider build; it is not a simulation.

## Current limits

This workspace does not provide Vercel integration, repository import/provisioning, custom GitHub Actions pipelines, rollback, live log streaming, arbitrary shell access, arbitrary SQL, secret retrieval, arbitrary service environment editing or database migration execution.

## Admin Terminal boundary

The Admin Terminal is a separate allow-listed diagnostic console. Its read-only `deployments` / `render` commands list connected Render services and actual URLs; `neon` lists connected Neon projects. Database-backed status commands query selected live BALMZ AI records. The terminal never runs host-shell commands or arbitrary SQL and cannot read files or secret values or mutate accounts, subscriptions or payments. Deployment mutations remain in the protected Deployment Workplace with separate action confirmations.
