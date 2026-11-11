# BALMZ AI Paystack Billing Runbook

**Status: implementation specification — billing remains disabled.** This document does not activate charges, create Paystack plans, or seed prices.

## Goals and invariants

- Paystack is the payment processor; Neon remains the source of truth for BALMZ AI account entitlements and payment history.
- A browser redirect, query parameter, client callback, or user-supplied status must never activate a subscription.
- Only a server-verified successful transaction, matched to a pending internal checkout and the expected user, plan, amount, and currency, may create or activate the corresponding subscription.
- Every webhook and verification operation must be idempotent.
- Test and live credentials, plans, webhooks, and transaction references are separate. Do not mix test and live records.
- No production billing is enabled until the owner supplies/sets merchant credentials securely, confirms prices/currency/intervals/entitlements, and explicitly approves live mode.

## Required server environment

Set in Render service secrets only; never commit these values or expose them to browser code.

| Variable | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | Server-side Paystack secret for the selected mode |
| `PAYSTACK_PUBLIC_KEY` | Public checkout key, if the chosen checkout flow requires it; may be exposed only as a public key |
| `PAYSTACK_MODE` | Explicit `test` or `live`; fail closed if absent or inconsistent with key prefix |
| `PAYSTACK_WEBHOOK_SECRET` | Webhook signing secret where the Paystack dashboard provides the newer `Paystack-Signature` format |
| `APP_BASE_URL` | Canonical HTTPS origin used to construct trusted callback URLs |

Do not use a real key in local examples, CI, logs, issue comments, or source control. Verify test/live key prefixes at startup and reject mode mismatches.

## Database work required before implementation

Add a forward-only migration after reviewing the live schema and backup. Preserve migration 0001 and all existing rows.

Recommended additions:
- A checkout-attempt table with an opaque ID, user ID, plan ID, expected amount in minor units, currency, mode, unique internal reference, provider reference, status, expiry, and timestamps.
- Unique provider transaction reference and unique internal checkout reference.
- A billing event inbox with provider event identifier or deterministic deduplication key, raw-payload SHA-256 digest, received/processed timestamps, status, and a bounded error code. Do not store secrets or unnecessary cardholder data.
- Subscription provider codes and customer codes with unique constraints where appropriate.
- Audit events for admin plan/entitlement changes, refunds, cancellations, and manual corrections.

Keep monetary values as integer minor units. Never use floating-point currency arithmetic. Keep card numbers, CVV, PINs, and full authorization secrets out of BALMZ AI storage.

## Checkout flow

1. Require an authenticated user and validate that the requested plan is enabled and public.
2. Read price, currency, interval, and entitlements from the server-side plan record; ignore client-supplied amount, email, user ID, and entitlement fields.
3. Create a pending checkout attempt and unique reference in a DB transaction.
4. Initialize the Paystack transaction server-to-server over HTTPS with the configured secret. Use the internal reference and canonical callback URL.
5. Persist the provider response reference and return only the checkout URL and safe display metadata to the browser.
6. The browser callback displays a pending/processing state and asks the server to verify the internal reference. It does not grant access.
7. The server calls Paystack's verify-transaction endpoint and validates successful status, reference, amount, currency, and customer identity against the pending attempt.
8. In one database transaction, mark the attempt paid, insert a unique payment record, and create/update the subscription. Entitlement activation and payment record creation must commit atomically.
9. Repeated callbacks or duplicate webhooks return the existing result without creating duplicate payments or subscriptions.

## Webhook security and processing

- Capture the exact raw request bytes before JSON parsing.
- Prefer the current `Paystack-Signature` verification format described in Paystack's webhook documentation: parse timestamp and all `v1` signatures, enforce a narrow clock-skew window, calculate HMAC-SHA512 over `timestamp.rawBody` using the configured webhook signing secret, and compare with constant-time equality.
- Where legacy events still use `x-paystack-signature`, validate the HMAC-SHA512 of the exact raw body with the Paystack secret key using constant-time comparison. Support only the formats actually configured for the merchant; reject unsigned requests.
- Never trust event JSON until the signature passes.
- Insert the event into the inbox with a unique dedupe key before processing. Duplicate deliveries must not repeat side effects.
- Acknowledge verified events quickly with HTTP 200; process durable work asynchronously or within a bounded transaction.
- Handle at least successful charges, failed invoices, subscription create/disable/not-renew, refunds/reversals, and unknown event types safely. Unknown but authentic events should be recorded and acknowledged without changing entitlements.
- Reconcile transaction references against Paystack's verification API before entitlement changes when the event alone is insufficient.
- Log event IDs, internal references, status, and safe error codes only. Never log secret keys or full payment instrument details.

## Subscription lifecycle

Map provider events to a finite internal state machine: incomplete, trialing, active, past_due, paused, canceled, expired. Define transitions explicitly and reject stale/out-of-order events using provider timestamps plus current database state. Cancellation at period end must retain access only through the paid-through date. Immediate cancellation/revocation must be an explicit product policy.

Paystack documentation states subscription charges are not retried by Paystack. Implement customer notifications and an application-controlled recovery path, but do not silently create repeated charges. A failed renewal must move to the configured grace/past_due policy; the exact grace period is a product decision.

## Refunds, disputes, and reconciliation

- Never infer a refund from a customer request or dashboard screenshot.
- Record refund/reversal events and reconcile provider status before adjusting entitlements.
- Provide an admin-only reconciliation job that compares pending/internal records with Paystack verification results.
- Reconciliation must be safe to run repeatedly and produce an audit trail.
- Add alerting for signature failures, mismatched amount/currency, duplicate references, stuck pending transactions, and webhook processing failures.

## Test plan (before live mode)

1. Missing/invalid credentials fail closed without leaking values.
2. Test key cannot be used with live mode and vice versa.
3. Checkout cannot be initialized while the plan is disabled or missing price/currency/interval.
4. Client-supplied amount, user ID, plan entitlements, or status are ignored.
5. Successful verify with exact amount/currency activates once.
6. Failed, abandoned, pending, wrong-amount, wrong-currency, and wrong-reference transactions never activate.
7. Callback replay and duplicate webhook do not duplicate payment or entitlement.
8. Invalid signature, malformed body, stale timestamp, and unsupported signature fail safely.
9. Authentic unknown event is recorded and acknowledged without granting access.
10. Renewal failure, cancellation, refund, and reversal follow the approved state machine.
11. Signed-out checkout and cross-user reference access are rejected.
12. Run integration tests using Paystack test credentials and test-mode dashboard only.

## Go-live gates

- Merchant account live-mode approval and compliance status confirmed by owner.
- Exact plan names, prices, currency, intervals, feature entitlements, taxes/fees disclosure, and cancellation/refund policy approved.
- Live keys and webhook signing secret entered directly in Render secret settings.
- Live webhook URL configured in Paystack dashboard and pinged successfully.
- Security review and test suite pass; database backup and rollback plan verified.
- Owner explicitly approves switching `PAYSTACK_MODE=live` and enabling checkout. Until then, keep checkout disabled.
