import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import {
  createOAuthState,
  getOAuthAppCredentials,
  oauthRedirectUri,
  type OAuthServiceId,
} from "@/lib/service-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ serviceId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { serviceId: rawServiceId } = await context.params;
  if (rawServiceId !== "github" && rawServiceId !== "notion") {
    return NextResponse.json({ error: "OAUTH_PROVIDER_NOT_SUPPORTED" }, { status: 404 });
  }
  const serviceId = rawServiceId as OAuthServiceId;
  const app = getOAuthAppCredentials(serviceId);
  if (!app) {
    return NextResponse.json({
      error: "OAUTH_APP_NOT_CONFIGURED",
      message: serviceId === "github"
        ? "Register a GitHub App and configure GITHUB_APP_CLIENT_ID and GITHUB_APP_CLIENT_SECRET on Render."
        : "Create a public Notion integration and configure NOTION_OAUTH_CLIENT_ID and NOTION_OAUTH_CLIENT_SECRET on Render.",
    }, { status: 503 });
  }

  try {
    const redirectUri = oauthRedirectUri(new URL(request.url).origin, serviceId);
    const state = createOAuthState(session.user.id, serviceId);
    const target = serviceId === "github"
      ? new URL("https://github.com/login/oauth/authorize")
      : new URL("https://api.notion.com/v1/oauth/authorize");
    target.searchParams.set("client_id", app.clientId);
    target.searchParams.set("redirect_uri", redirectUri);
    target.searchParams.set("state", state.state);

    if (serviceId === "github") {
      target.searchParams.set("code_challenge", state.codeChallenge ?? "");
      target.searchParams.set("code_challenge_method", "S256");
      target.searchParams.set("allow_signup", "false");
    } else {
      target.searchParams.set("response_type", "code");
      target.searchParams.set("owner", "user");
    }

    const response = NextResponse.redirect(target, { status: 302 });
    response.cookies.set("balmz_connector_oauth_" + serviceId, state.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/api/admin/service-connectors/oauth/" + serviceId + "/callback",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "OAUTH_START_FAILED" }, { status: 503 });
  }
}
