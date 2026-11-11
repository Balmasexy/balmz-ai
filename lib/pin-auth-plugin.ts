import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { getDbPool } from "@/lib/db";
import {
  createEmailCode,
  createRecoveryToken,
  digestRecoveryValue,
  hashPin,
  isValidPin,
  normalizeAuthEmail,
  safeDigestEqual,
  verifyPin,
} from "@/lib/pin-security";
import { sendPinRecoveryCode } from "@/lib/transactional-email";

const invalidLogin = () =>
  APIError.from("UNAUTHORIZED", { message: "Email or PIN is incorrect." });
const invalidRecovery = () =>
  APIError.from("UNAUTHORIZED", { message: "The code or PIN is invalid or has expired." });

const emailSchema = z.string().trim().email().max(254).transform(normalizeAuthEmail);
const pinSchema = z.string().regex(/^\d{6}$/);

export function pinAuthPlugin() {
  return {
    id: "balmz-pin-auth",
    endpoints: {
      signInPin: createAuthEndpoint(
        "/sign-in/pin",
        {
          method: "POST",
          body: z.object({ email: emailSchema, pin: pinSchema }),
        },
        async (ctx) => {
          const userRecord = await ctx.context.internalAdapter.findUserByEmail(ctx.body.email);
          const user = userRecord?.user;
          if (!user) throw invalidLogin();

          const result = await getDbPool().query<{
            pin_hash: string;
            failed_attempts: number;
            locked_until: Date | null;
          }>(
            `SELECT pin_hash, failed_attempts, locked_until
             FROM public.balmz_auth_pins WHERE user_id = $1 LIMIT 1`,
            [user.id],
          );
          const pinRecord = result.rows[0];
          if (!pinRecord) throw invalidLogin();

          if (pinRecord.locked_until && new Date(pinRecord.locked_until).getTime() > Date.now()) {
            throw invalidLogin();
          }

          if (!(await verifyPin(ctx.body.pin, pinRecord.pin_hash))) {
            const nextAttempts =
              pinRecord.locked_until && new Date(pinRecord.locked_until).getTime() <= Date.now()
                ? 1
                : Number(pinRecord.failed_attempts) + 1;
            await getDbPool().query(
              `UPDATE public.balmz_auth_pins
               SET failed_attempts = $2,
                   locked_until = CASE WHEN $2 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
                   updated_at = now()
               WHERE user_id = $1`,
              [user.id, nextAttempts],
            );
            throw invalidLogin();
          }

          await getDbPool().query(
            `UPDATE public.balmz_auth_pins
             SET failed_attempts = 0, locked_until = NULL, updated_at = now()
             WHERE user_id = $1`,
            [user.id],
          );

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              message: "Unable to create a secure session.",
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true, redirectTo: "/dashboard" });
        },
      ),

      setupPin: createAuthEndpoint(
        "/pin/setup",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({ pin: pinSchema, confirmPin: pinSchema }),
        },
        async (ctx) => {
          if (ctx.body.pin !== ctx.body.confirmPin || !isValidPin(ctx.body.pin)) {
            throw APIError.from("BAD_REQUEST", {
              message: "Choose a six-digit PIN and enter it twice. Avoid repeated or obvious sequences.",
            });
          }

          const userId = ctx.context.session.user.id;
          const pinHash = await hashPin(ctx.body.pin);
          const inserted = await getDbPool().query(
            `INSERT INTO public.balmz_auth_pins (user_id, pin_hash)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO NOTHING
             RETURNING user_id`,
            [userId, pinHash],
          );
          if (inserted.rowCount !== 1) {
            throw APIError.from("CONFLICT", {
              message: "A PIN is already set for this account.",
            });
          }
          return ctx.json({ ok: true, redirectTo: "/dashboard" });
        },
      ),

      requestRecoveryCode: createAuthEndpoint(
        "/recovery/request-code",
        { method: "POST", body: z.object({ email: emailSchema }) },
        async (ctx) => {
          // The response is identical for registered and unregistered addresses.
          // No email is sent unless the address belongs to an account with a PIN.
          const userResult = await getDbPool().query<{ id: string; email: string }>(
            `SELECT u.id, u.email
             FROM public."user" u
             JOIN public.balmz_auth_pins p ON p.user_id = u.id
             WHERE lower(u.email) = lower($1)
             LIMIT 1`,
            [ctx.body.email],
          );
          const user = userResult.rows[0];
          if (!user) {
            return ctx.json({
              ok: true,
              message: "If this email is registered, a recovery code will be sent.",
            });
          }

          const pool = getDbPool();
          const previous = await pool.query<{ last_sent_at: Date }>(
            `SELECT last_sent_at FROM public.balmz_auth_recovery
             WHERE user_id = $1 LIMIT 1`,
            [user.id],
          );
          const lastSentAt = previous.rows[0]?.last_sent_at;
          if (lastSentAt && Date.now() - new Date(lastSentAt).getTime() < 60_000) {
            return ctx.json({
              ok: true,
              message: "If this email is registered, a recovery code will be sent.",
            });
          }

          const code = createEmailCode();
          const codeHash = digestRecoveryValue("email-code", user.id, code);
          await pool.query(
            `INSERT INTO public.balmz_auth_recovery
               (user_id, code_hash, expires_at, attempts, last_sent_at,
                code_verified_at, pin_verified_at, reset_token_hash, reset_expires_at)
             VALUES ($1, $2, now() + interval '10 minutes', 0, now(), NULL, NULL, NULL, NULL)
             ON CONFLICT (user_id) DO UPDATE SET
               code_hash = EXCLUDED.code_hash,
               expires_at = EXCLUDED.expires_at,
               attempts = 0,
               last_sent_at = now(),
               code_verified_at = NULL,
               pin_verified_at = NULL,
               reset_token_hash = NULL,
               reset_expires_at = NULL,
               updated_at = now()`,
            [user.id, codeHash],
          );

          try {
            await sendPinRecoveryCode({ to: user.email, code });
          } catch (error) {
            await pool.query("DELETE FROM public.balmz_auth_recovery WHERE user_id = $1", [user.id]);
            // Avoid logging any user identifier or code. A configuration/provider fault is enough.
            console.error("BALMZ AI recovery email delivery failed:", error instanceof Error ? error.message : "unknown error");
          }

          return ctx.json({
            ok: true,
            message: "If this email is registered, a recovery code will be sent.",
          });
        },
      ),

      verifyRecoveryCode: createAuthEndpoint(
        "/recovery/verify-code",
        {
          method: "POST",
          body: z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }),
        },
        async (ctx) => {
          const userResult = await getDbPool().query<{ id: string }>(
            `SELECT id FROM public."user" WHERE lower(email) = lower($1) LIMIT 1`,
            [ctx.body.email],
          );
          const userId = userResult.rows[0]?.id;
          if (!userId) throw invalidRecovery();

          const recoveryResult = await getDbPool().query<{
            code_hash: string;
            expires_at: Date;
            attempts: number;
          }>(
            `SELECT code_hash, expires_at, attempts
             FROM public.balmz_auth_recovery WHERE user_id = $1 LIMIT 1`,
            [userId],
          );
          const recovery = recoveryResult.rows[0];
          if (
            !recovery ||
            new Date(recovery.expires_at).getTime() <= Date.now() ||
            Number(recovery.attempts) >= 5
          ) {
            throw invalidRecovery();
          }

          const candidate = digestRecoveryValue("email-code", userId, ctx.body.code);
          if (!safeDigestEqual(candidate, recovery.code_hash)) {
            await getDbPool().query(
              `UPDATE public.balmz_auth_recovery
               SET attempts = attempts + 1,
                   expires_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE expires_at END,
                   updated_at = now()
               WHERE user_id = $1`,
              [userId],
            );
            throw invalidRecovery();
          }

          await getDbPool().query(
            `UPDATE public.balmz_auth_recovery
             SET code_verified_at = now(), pin_verified_at = NULL,
                 reset_token_hash = NULL, reset_expires_at = NULL, updated_at = now()
             WHERE user_id = $1`,
            [userId],
          );
          return ctx.json({ ok: true, nextStep: "pin" });
        },
      ),

      verifyRecoveryPin: createAuthEndpoint(
        "/recovery/verify-pin",
        {
          method: "POST",
          body: z.object({ email: emailSchema, pin: pinSchema }),
        },
        async (ctx) => {
          const result = await getDbPool().query<{
            user_id: string;
            pin_hash: string;
            failed_attempts: number;
            locked_until: Date | null;
          }>(
            `SELECT u.id AS user_id, p.pin_hash, p.failed_attempts, p.locked_until
             FROM public."user" u
             JOIN public.balmz_auth_pins p ON p.user_id = u.id
             JOIN public.balmz_auth_recovery r ON r.user_id = u.id
             WHERE lower(u.email) = lower($1)
               AND r.code_verified_at > now() - interval '10 minutes'
               AND r.expires_at > now()
             LIMIT 1`,
            [ctx.body.email],
          );
          const record = result.rows[0];
          if (!record) throw invalidRecovery();

          if (record.locked_until && new Date(record.locked_until).getTime() > Date.now()) {
            throw invalidRecovery();
          }
          if (!(await verifyPin(ctx.body.pin, record.pin_hash))) {
            const nextAttempts =
              record.locked_until && new Date(record.locked_until).getTime() <= Date.now()
                ? 1
                : Number(record.failed_attempts) + 1;
            await getDbPool().query(
              `UPDATE public.balmz_auth_pins
               SET failed_attempts = $2,
                   locked_until = CASE WHEN $2 >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
                   updated_at = now()
               WHERE user_id = $1`,
              [record.user_id, nextAttempts],
            );
            throw invalidRecovery();
          }

          await getDbPool().query(
            `UPDATE public.balmz_auth_pins
             SET failed_attempts = 0, locked_until = NULL, updated_at = now()
             WHERE user_id = $1`,
            [record.user_id],
          );

          const token = createRecoveryToken();
          const tokenHash = digestRecoveryValue("reset-token", record.user_id, token);
          await getDbPool().query(
            `UPDATE public.balmz_auth_recovery
             SET pin_verified_at = now(),
                 reset_token_hash = $2,
                 reset_expires_at = now() + interval '10 minutes',
                 updated_at = now()
             WHERE user_id = $1 AND code_verified_at > now() - interval '10 minutes'`,
            [record.user_id, tokenHash],
          );
          return ctx.json({ ok: true, resetToken: token, nextStep: "change-password" });
        },
      ),

      completeRecovery: createAuthEndpoint(
        "/recovery/complete-password",
        {
          method: "POST",
          body: z.object({
            email: emailSchema,
            resetToken: z.string().min(32).max(128),
            newPassword: z.string().min(12).max(128),
          }),
        },
        async (ctx) => {
          const email = ctx.body.email;
          const userRecord = await ctx.context.internalAdapter.findUserByEmail(email);
          const user = userRecord?.user;
          if (!user) throw invalidRecovery();

          const tokenHash = digestRecoveryValue("reset-token", user.id, ctx.body.resetToken);
          const passwordHash = await ctx.context.password.hash(ctx.body.newPassword);
          const client = await getDbPool().connect();
          try {
            await client.query("BEGIN");
            const challenge = await client.query<{ account_id: string }>(
              `SELECT a.id AS account_id
               FROM public.balmz_auth_recovery r
               JOIN public.account a ON a."userId" = r.user_id AND a."providerId" = 'credential'
               WHERE r.user_id = $1
                 AND r.reset_token_hash = $2
                 AND r.reset_expires_at > now()
                 AND r.pin_verified_at > now() - interval '10 minutes'
               FOR UPDATE OF r, a`,
              [user.id, tokenHash],
            );
            const accountId = challenge.rows[0]?.account_id;
            if (!accountId) throw invalidRecovery();

            const updated = await client.query(
              `UPDATE public.account SET password = $1, "updatedAt" = now()
               WHERE id = $2 AND "userId" = $3 AND "providerId" = 'credential'`,
              [passwordHash, accountId, user.id],
            );
            if (updated.rowCount !== 1) throw invalidRecovery();

            await client.query('DELETE FROM public."session" WHERE "userId" = $1', [user.id]);
            await client.query("DELETE FROM public.balmz_auth_recovery WHERE user_id = $1", [user.id]);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            throw error;
          } finally {
            client.release();
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              message: "Password changed, but a new session could not be created. Sign in with your PIN.",
            });
          }
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true, redirectTo: "/dashboard" });
        },
      ),
    },
    rateLimit: [
      { pathMatcher: (path: string) => path === "/sign-in/pin", window: 60, max: 8 },
      { pathMatcher: (path: string) => path === "/recovery/request-code", window: 60, max: 3 },
      { pathMatcher: (path: string) => path === "/recovery/verify-code", window: 60, max: 5 },
      { pathMatcher: (path: string) => path === "/recovery/verify-pin", window: 60, max: 5 },
      { pathMatcher: (path: string) => path === "/recovery/complete-password", window: 60, max: 3 },
      { pathMatcher: (path: string) => path === "/pin/setup", window: 60, max: 5 },
    ],
  } satisfies BetterAuthPlugin;
}
