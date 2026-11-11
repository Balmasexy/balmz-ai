import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { baseURL } from "@/baseUrl";
import { getDbPool } from "@/lib/db";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { pinAuthPlugin } from "@/lib/pin-auth-plugin";

let authInstance: ReturnType<typeof createAuth> | undefined;

function getAuthBaseUrl(): string {
  const configured = process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || baseURL;
  const url = new URL(configured);

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  }

  return url.origin;
}

function getTrustedOrigins(authBaseUrl: string): string[] {
  const configured = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);

  return [...new Set([authBaseUrl, ...configured])];
}

/**
 * Lazy initialization keeps Next.js build-time imports from requiring
 * production secrets. The first auth request fails closed if configuration
 * is missing or invalid.
 */
export function getAuth(): ReturnType<typeof createAuth> {
  if (authInstance) return authInstance;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to a random value of at least 32 characters.");
  }

  const authBaseUrl = getAuthBaseUrl();
  const isProduction = process.env.NODE_ENV === "production";

  const instance = createAuth({ secret, authBaseUrl, isProduction });
  authInstance = instance;
  return instance;
}

function createAuth(config: {
  secret: string;
  authBaseUrl: string;
  isProduction: boolean;
}) {
  return betterAuth({
    appName: "BALMZ AI",
    baseURL: config.authBaseUrl,
    secret: config.secret,
    trustedOrigins: getTrustedOrigins(config.authBaseUrl),
    database: getDbPool(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    // Users may use their password once to establish a PIN. Once a PIN exists,
    // the normal email/password sign-in endpoint is rejected server-side.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email") return;
        const email =
          typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : "";
        if (!email) return;

        const pin = await getDbPool().query(
          `SELECT 1
           FROM public.balmz_auth_pins p
           JOIN public."user" u ON u.id = p.user_id
           WHERE lower(u.email) = lower($1)
           LIMIT 1`,
          [email],
        );
        if (pin.rowCount) {
          throw APIError.from("FORBIDDEN", {
            message: "This account uses PIN login. Enter your six-digit PIN.",
          });
        }
      }),
    },
    // Password reset must follow the app's email-code -> existing PIN -> new
    // password recovery flow; do not expose the built-in bypass endpoints.
    disabledPaths: ["/request-password-reset", "/reset-password", "/change-password"],
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: "lax",
        path: "/",
      },
    },
    plugins: [pinAuthPlugin(), nextCookies()],
  });
}
