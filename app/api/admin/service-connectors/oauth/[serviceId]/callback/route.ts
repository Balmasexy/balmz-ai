import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getDbPool } from "@/lib/db";
import { encryptServiceCredentials, testServiceConnection } from "@/lib/service-connectors";
import {
  getOAuthAppCredentials,
  oauthRedirectUri,
  verifyOAuthState,
  type OAuthServiceId,
} from "@/lib/service-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ serviceId: string }> };

function resultUrl(origin: string, serviceId: string, status: string) {
  const base = process.env.APP_BASE_URL || process.env.BETTER_AUTH_URL || origin;
  const url = new URL("/admin", base);
  url.searchParams.set("section", "service-connectors");
  url.searchParams.set("integration", serviceId);
  url.searchParams.set("oauth", status);
  return url;
}

export async function GET(request: Request, context: RouteContext) {
  const { serviceId: rawServiceId } = await context.params;
  if (rawServiceId !== "github" && rawServiceId !== "notion") {
    return NextResponse.json({ error: "OAUTH_PROVIDER_NOT_SUPPORTED" }, { status: 404 });
  }
  const serviceId = rawServiceId as OAuthServiceId;
  const url = new URL(request.url);
  const cookieName = "balmz_connector_oauth_" + serviceId;
  const cookiePath = "/api/admin/service-connectors/oauth/" + serviceId + "/callback";
  const stateCookie = request.headers.get("cookie")?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  const code = url.searchParams.get("code") || "";
  const returnedState = url.searchParams.get("state") || "";
  const app = getOAuthAppCredentials(serviceId);

  const redirect = (status: string) => {
    const response = NextResponse.redirect(resultUrl(url.origin, serviceId, status));
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: cookiePath,
    });
    return response;
  };

  if (!stateCookie || !returnedState || !code || !app) return redirect("failed");

  try {
    const state = verifyOAuthState(decodeURIComponent(stateCookie), returnedState, serviceId);
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session || !(await isAdminUser(session.user.id)) || session.user.id !== state.userId) {
      return redirect("unauthorized");
    }

    const redirectUri = oauthRedirectUri(url.origin, serviceId);
    let credentials: Record<string, string>;
    let displayName: string;

    if (serviceId === "github") {
      if (!state.codeVerifier) return redirect("failed");
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: app.clientId,
          client_secret: app.clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: state.codeVerifier,
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenResponse.ok) return redirect("failed");
      const token = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_token_expires_in?: number;
        error?: string;
      };
      if (!token.access_token) return redirect("failed");
      const identityResponse = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token.access_token,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!identityResponse.ok) return redirect("failed");
      const identity = await identityResponse.json() as { id?: number; login?: string; name?: string };
      if (!identity.login) return redirect("failed");
      credentials = {
        token: token.access_token,
        authMethod: "github-app-oauth",
        accountName: identity.login,
        accountId: String(identity.id ?? ""),
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        ...(token.expires_in ? { expiresAt: String(Date.now() + token.expires_in * 1000) } : {}),
        ...(token.refresh_token_expires_in ? { refreshExpiresAt: String(Date.now() + token.refresh_token_expires_in * 1000) } : {}),
      };
      displayName = "GitHub · " + identity.login;
      await testServiceConnection("github", credentials, "live");
    } else {
      const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Basic " + Buffer.from(app.clientId + ":" + app.clientSecret).toString("base64"),
          "Notion-Version": "2026-03-11",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenResponse.ok) return redirect("failed");
      const token = await tokenResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_token_expires_in?: number;
        workspace_id?: string;
        workspace_name?: string;
        bot_id?: string;
      };
      if (!token.access_token) return redirect("failed");
      credentials = {
        token: token.access_token,
        authMethod: "notion-oauth",
        workspaceName: token.workspace_name || "Notion workspace",
        workspaceId: token.workspace_id || "",
        botId: token.bot_id || "",
        ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
        ...(token.expires_in ? { expiresAt: String(Date.now() + token.expires_in * 1000) } : {}),
        ...(token.refresh_token_expires_in ? { refreshExpiresAt: String(Date.now() + token.refresh_token_expires_in * 1000) } : {}),
      };
      displayName = "Notion · " + (token.workspace_name || token.workspace_id || "workspace");
      await testServiceConnection("notion", credentials, "live");
    }

    const encrypted = encryptServiceCredentials(credentials);
    await getDbPool().query(
      `INSERT INTO public.balmz_service_credentials
         (id, service_id, display_name, environment, encrypted_credentials, status, last_tested_at, last_error_code, created_by_user_id)
       VALUES ($1, $2, $3, 'live', $4, 'connected', now(), NULL, $5)
       ON CONFLICT (service_id, environment, display_name)
       DO UPDATE SET encrypted_credentials = EXCLUDED.encrypted_credentials,
                     status = 'connected',
                     last_tested_at = now(),
                     last_error_code = NULL,
                     created_by_user_id = EXCLUDED.created_by_user_id,
                     updated_at = now()`,
      [randomUUID(), serviceId, displayName, encrypted, session.user.id],
    );
    await getDbPool().query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        randomUUID(),
        session.user.id,
        serviceId + "_oauth_connected",
        JSON.stringify({ displayName, authMethod: credentials.authMethod }),
      ],
    ).catch(() => undefined);
    return redirect("connected");
  } catch {
    return redirect("failed");
  }
}
