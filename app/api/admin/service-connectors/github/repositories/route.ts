import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { getDbPool } from "@/lib/db";
import { encryptServiceCredentials, decryptServiceCredentials } from "@/lib/service-connectors";
import { refreshOAuthCredentials } from "@/lib/service-oauth";
import {
  decryptServiceCredentials,
  SERVICE_CATALOG,
  serviceCredentialsFromEnvironment,
  type ServiceEnvironment,
} from "@/lib/service-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let token = "";
  try {
    const result = await getDbPool().query<{ id: string; encrypted_credentials: string }>(
      `SELECT id, encrypted_credentials FROM public.balmz_service_credentials
        WHERE service_id = 'github' AND status = 'connected'
        ORDER BY last_tested_at DESC NULLS LAST LIMIT 1`,
    );
    if (result.rows[0]) {
      const stored = decryptServiceCredentials(result.rows[0].encrypted_credentials);
      const credentials = stored.authMethod === "github-app-oauth"
        ? await refreshOAuthCredentials("github", stored)
        : stored;
      token = credentials.token ?? "";
      if (credentials.token !== stored.token) {
        await getDbPool().query(
          "UPDATE public.balmz_service_credentials SET encrypted_credentials = $2, updated_at = now() WHERE id = $1",
          [result.rows[0].id, encryptServiceCredentials(credentials)],
        );
      }
    } else {
      const env = serviceCredentialsFromEnvironment("github", "live" as ServiceEnvironment);
      token = env?.token ?? "";
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") {
      return NextResponse.json({ error: "SERVICE_CONNECTOR_SCHEMA_REQUIRED", message: "Apply migration 0003 first." }, { status: 503 });
    }
    return NextResponse.json({ error: "GITHUB_CONNECTION_UNAVAILABLE", message: "Connect a GitHub token before listing repositories." }, { status: 503 });
  }

  if (!token) return NextResponse.json({ error: "GITHUB_NOT_CONNECTED", message: "Connect GitHub to list repositories." }, { status: 503 });

  const response = await fetch("https://api.github.com/user/repos?per_page=50&sort=updated&direction=desc", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return NextResponse.json({ error: "GITHUB_REPOSITORIES_FAILED", message: response.status === 401 || response.status === 403 ? "GitHub rejected this token or its repository permissions." : "GitHub could not return repositories." }, { status: response.status === 429 ? 429 : 502 });

  const entries = await response.json() as Array<{
    id: number; name: string; full_name: string; private: boolean; html_url: string;
    default_branch: string; updated_at: string; description: string | null;
  }>;
  return NextResponse.json({
    repositories: entries.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      description: repo.description,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
