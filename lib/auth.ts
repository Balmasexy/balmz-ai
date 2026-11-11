import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { baseURL } from "@/baseUrl";
import { getDbPool } from "@/lib/db";

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
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // The public Free plan is the default entitlement for every new registration.
            // The AI route also has a safe lazy-provision fallback if this hook is interrupted.
            try {
              await getDbPool().query(
                `INSERT INTO public.balmz_subscriptions
                   (id, user_id, plan_id, status, billing_provider, current_period_starts_at, current_period_ends_at)
                 SELECT $1, $2, p.id, 'active', 'admin', now(), NULL
                   FROM public.balmz_subscription_plans p
                  WHERE p.code = 'free' AND p.is_enabled = true
                 ON CONFLICT (id) DO NOTHING`,
                [`free-${user.id}`, user.id],
              );
            } catch (error) {
              console.error("BALMZ AI default Free plan provisioning failed:", error instanceof Error ? error.message : "unknown error");
            }
          },
        },
      },
    },
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
        secure: config.isProduction,
        sameSite: "lax",
        path: "/",
      },
    },
    plugins: [nextCookies()],
  });
}
