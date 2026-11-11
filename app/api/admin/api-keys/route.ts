import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { isAdminUser } from "@/lib/admin";
import { createBalmzApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Environment = "demo" | "live";
const allowedScopes = new Set(["platform:read"]);

async function authorize() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }), session: null };
  if (!(await isAdminUser(session.user.id))) return { response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }), session: null };
  return { response: null, session };
}

function migrationRequired() {
  return NextResponse.json({ error: "API_KEY_SCHEMA_REQUIRED", message: "Apply db/migrations/0003_api_keys_integrations_and_payments.sql first." }, { status: 503 });
}

export async function GET() {
  const auth = await authorize();
  if (auth.response) return auth.response;
  try {
    const result = await getDbPool().query<{
      id: string; name: string; environment: Environment; key_prefix: string;
      scopes: string[]; status: string; created_at: string; last_used_at: string | null;
      expires_at: string | null; revoked_at: string | null;
    }>(
      `SELECT id, name, environment, key_prefix, scopes, status, created_at, last_used_at, expires_at, revoked_at
         FROM public.balmz_api_keys
        ORDER BY created_at DESC LIMIT 100`,
    );
    return NextResponse.json({
      keys: result.rows.map((item) => ({
        ...item,
        lastFour: item.key_prefix.slice(-4),
        keyPrefix: item.key_prefix,
      })),
      supportedScopes: [...allowedScopes],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({ error: "API_KEYS_UNAVAILABLE", message: "API keys could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize();
  if (auth.response || !auth.session) return auth.response;
  let body: { name?: unknown; environment?: unknown; scopes?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const environment: Environment = body.environment === "live" ? "live" : "demo";
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter((scope): scope is string => typeof scope === "string" && allowedScopes.has(scope))
    : [];
  if (name.length < 2 || name.length > 60) return NextResponse.json({ error: "INVALID_NAME", message: "Give the key a name between 2 and 60 characters." }, { status: 400 });
  if (!scopes.length) return NextResponse.json({ error: "SCOPE_REQUIRED", message: "Select at least one supported scope." }, { status: 400 });

  try {
    const generated = createBalmzApiKey(environment);
    const id = randomUUID();
    const result = await getDbPool().query(
      `INSERT INTO public.balmz_api_keys
         (id, name, environment, key_prefix, key_hash, scopes, status, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id, name, environment, key_prefix, scopes, status, created_at, expires_at`,
      [id, name, environment, generated.keyPrefix, generated.keyHash, scopes, auth.session.user.id],
    );
    const saved = result.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      success: true,
      key: generated.value,
      record: { ...saved, lastFour: generated.lastFour },
      warning: "Copy this key now. BALMZ AI stores only its hash and cannot show the full secret again.",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({ error: "API_KEY_CREATE_FAILED", message: "A new API key could not be created." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize();
  if (auth.response) return auth.response;
  let body: { id?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(body.id)) return NextResponse.json({ error: "INVALID_KEY_ID" }, { status: 400 });

  try {
    const result = await getDbPool().query(
      `UPDATE public.balmz_api_keys SET status = 'revoked', revoked_at = now()
        WHERE id = $1 AND status = 'active' RETURNING id`,
      [body.id],
    );
    if (!result.rowCount) return NextResponse.json({ error: "ACTIVE_KEY_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return migrationRequired();
    return NextResponse.json({ error: "API_KEY_REVOKE_FAILED" }, { status: 503 });
  }
}
