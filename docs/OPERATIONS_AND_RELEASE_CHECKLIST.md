# BALMZ AI Operations, Secrets, and Release Checklist

## Service boundaries

- Web application and authentication: Render service `balmz-ai`.
- Accounts, plans, subscriptions, payments, usage, and audit records: dedicated Neon project/database `BALMZ AI` / `balmz_ai`.
- Terminal execution: separate sandbox/gateway/orchestrator infrastructure; never execute untrusted shell commands in the Next.js process.
- Provider integrations: server-side adapters only; each provider has independent credentials, permissions, usage caps, and health status.

## Server-only secret inventory

| Variable | Purpose | Exposure |
|---|---|---|
| `DATABASE_URL` | Neon runtime DB role | Server only |
| `BETTER_AUTH_SECRET` | Session/auth signing | Server only |
| `BETTER_AUTH_URL` | Canonical app origin | Server config |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Exact allowed origins | Server config |
| `PAYSTACK_SECRET_KEY` | Paystack server API | Server only |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack webhook signature | Server only |
| `PAYSTACK_PUBLIC_KEY` | Optional checkout public key | Public only if needed |
| `PAYSTACK_MODE` | Explicit test/live mode | Server config |
| `OPENAI_API_KEY` | OpenAI provider key | Server only |
| `GEMINI_API_KEY` | Gemini provider key | Server only |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | X OAuth application credentials | Server only |
| `X_BEARER_TOKEN` | X app-only public-data token, if used | Server only |
| `BALMZ_API_KEY` | First-party service credential, if provisioned | Server only |
| `TERMINAL_GATEWAY_URL` | Private/public gateway endpoint | Server config |
| `TERMINAL_GATEWAY_SIGNING_KEY` | Short-lived ticket signing | Server only |
| `SANDBOX_ORCHESTRATOR_URL`, `SANDBOX_ORCHESTRATOR_TOKEN` | Sandbox control plane | Server only |

Only configure variables for implemented features. Never put secrets in `NEXT_PUBLIC_*`, client bundles, repository files, terminal containers, analytics, logs, or support tickets. Use separate credentials for test and production and rotate after suspected exposure.

## Provider credential model

- OpenAI: use a project service account key for the deployed workload where available; scope it to the minimum required permissions and set project budgets/alerts.
- Gemini: restrict the key to the Gemini API and keep requests behind the BALMZ backend.
- X: distinguish app-only Bearer Token access from user-context OAuth. Posting as a user requires user authorization (for example OAuth 2.0 PKCE with appropriate scopes); an app Bearer Token alone is not user consent to publish.
- BALMZ API: define a first-party key issuer, hashed-at-rest key storage, prefix + one-time display, scopes, per-key quotas, expiry, revocation, rotation, and audit history. Never treat an arbitrary text field as an authenticated API key.
- Terminal: do not inject platform/provider master keys into shell environments. If users need provider access from the terminal, issue per-user, scoped, revocable credentials and disclose their permissions.

## Database change procedure

1. Inspect current schema and migration history; take a verified backup.
2. Write a forward-only migration; never rewrite migration 0001.
3. Review foreign keys, unique constraints, indexes, and transaction boundaries.
4. Apply in a non-production branch/database first using a migration-owner role, not the app runtime role.
5. Run schema, data-integrity, authorization, and rollback/restore tests.
6. Apply to production only after an explicit reviewed release approval. Preserve existing rows.

## CI and release gates

- Lockfile install succeeds with the pinned package manager.
- TypeScript check and production build pass.
- Unit and integration tests cover auth, access control, webhook signature, idempotency, payment verification, terminal isolation, quota enforcement, and path traversal.
- Dependency audit and secret scanning pass.
- Migrations are tested against a disposable database and reviewed for destructive operations.
- Render deploy is verified live by health checks and runtime logs.
- Smoke tests confirm public health, authenticated session, unauthorized endpoint rejection, and no payment/terminal access before entitlement.
- Deployment rollback and database restore procedures are documented and rehearsed.

## Environment and release gates

- Paystack stays disabled until test credentials are configured, the test suite passes, merchant live-mode approval is confirmed, plan prices/currency/intervals/entitlements and refund/cancellation policy are approved, and the owner explicitly authorizes live charges.
- Terminal stays disabled until an isolated sandbox provider/worker fleet, persistent storage, network policy, quotas, monitoring, backups, and cross-tenant isolation tests are in place. A Render web-service deployment by itself is not a terminal sandbox.
- AI provider routes stay disabled until their keys are configured and provider-specific cost caps, per-user quotas, model allow-lists, and error handling are verified.
- Email verification and password reset stay disabled until a transactional email provider and verified sender are configured and tested.

## Documentation index

- `docs/ACCOUNT_SUBSCRIPTION_FOUNDATION.md`: current identity, subscription schema, and usage foundation.
- `docs/PAYSTACK_BILLING_RUNBOOK.md`: Paystack design, webhook security, lifecycle, testing, and go-live gates.
- `docs/TERMINAL_ARCHITECTURE.md`: Termux-style Linux workspace architecture, isolation, API contract, and acceptance tests.
- `docs/OPERATIONS_AND_RELEASE_CHECKLIST.md`: secret inventory, service boundaries, migrations, release gates, and operations.
