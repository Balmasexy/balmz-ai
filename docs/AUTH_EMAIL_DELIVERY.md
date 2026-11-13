# Transactional email delivery

BALMZ AI uses Better Auth's built-in email verification and password-reset flows. Resend is the delivery provider. Email credentials are read only by the server and must never be exposed to the browser, committed to Git or pasted into chat.

## Before configuring Render

1. Create or use the owner's Resend account.
2. Add the sending domain and complete the DNS/domain verification steps shown by Resend.
3. Create an API key limited to sending email for that account.
4. Choose a sender address under the verified domain, for example `BALMZ AI <no-reply@yourdomain.example>`.

Do not use an unverified or third-party sender address. A successful code build does not verify deliverability.

## Render environment variables

In the BALMZ AI Render web service environment settings, configure both values:

- `RESEND_API_KEY`: the server-side Resend API key.
- `EMAIL_FROM`: the verified sender identity, including the display name if desired.

Never create a `NEXT_PUBLIC_RESEND_API_KEY` variable. Do not enter secrets in a chat, issue, source file, commit or CI log.

The application enables mandatory email verification and password-reset delivery only when both values are present. When they are absent, the application keeps existing sign-in available and reports that email delivery is not configured. This protects the existing unverified administrator account from an accidental lockout before delivery is ready.

## Verification flow

1. A new user registers using `/sign-up`.
2. Better Auth sends a time-limited verification email.
3. The user opens the verification link. Better Auth verifies the account and redirects to the configured dashboard callback.
4. The user signs in normally.
5. An unverified user who attempts sign-in receives a verification-required response and can request another verification message from `/sign-in`.

The server never sets `user.emailVerified` just because a link was requested or an email was sent. The user must complete the actual verification link.

## Password recovery flow

1. The user opens `/forgot-password` and requests a link.
2. Better Auth sends a time-limited reset URL to the account email address.
3. The user opens `/reset-password`, enters and confirms a new password of 12–128 characters.
4. Better Auth validates the token and changes the password.
5. Existing sessions are revoked by the configured `revokeSessionsOnPasswordReset` policy.

The confirmation page uses a generic message so the UI does not disclose whether an email address belongs to an account.

## Acceptance checks

After adding the real Render secrets and the service restarts, test with a separate account whose mailbox you control:

- Register a new account and confirm the verification message arrives.
- Check the link uses the production BALMZ AI domain, not a local or preview domain.
- Click the link and confirm the account becomes verified through Better Auth.
- Sign in with the verified account.
- Attempt sign-in with a fresh unverified test account and use the resend control.
- Request password recovery; confirm an email is delivered.
- Use the reset link once; verify that the password changes and old sessions are invalidated.
- Reuse the reset link and confirm that an expired/consumed link is rejected.
- Check Render logs for delivery failures without exposing recipient addresses, tokens or API keys.

Do not run these tests against the production administrator account until the owner confirms they can receive email at that address and can complete the link. Never edit the database verification flag manually.
