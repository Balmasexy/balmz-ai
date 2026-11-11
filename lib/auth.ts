import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { baseURL } from "@/baseUrl";
import { getDbPool } from "@/lib/db";

type AuthInstance = ReturnType<typeof betterAuth>;

let authInstance: AuthInstance | undefined;

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
export function getAuth(): AuthInstance {
  if (authInstance) return authInstance;

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to a random value of at least 32 characters.");
  }

  const authBaseUrl = getAuthBaseUrl();
  const isProduction = process.env.NODE_ENV === "production";

  authInstance = betterAuth({
    appName: "BALMZ AI",
    baseURL: authBaseUrl,
    secret,
    trustedOrigins: getTrustedOrigins(authBaseUrl),
    database: getDbPool(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
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
        secure: isProduction,
        sameSite: "lax",
        path: "/",
      },
    },
    plugins: [nextCookies()],
  });

  return authInstance;
}
