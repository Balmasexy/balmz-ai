import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DURATIONS = new Set(["week", "1_month", "3_months", "6_months", "9_months", "1_year", "lifetime"]);
function fail(message: string, status = 400) {
  return NextResponse.json({ error: "FAMILY_ACCESS_REQUEST_INVALID", message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return fail("Administrator access is required.", 403);
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") || "").trim().slice(0, 120);
  const grantFilter = params.get("grant") || "all";
  const verifiedFilter = params.get("verified") || "all";
  if (!["all", "granted", "ungranted"].includes(grantFilter) || !["all", "verified", "unverified"].includes(verifiedFilter)) return fail("Invalid account filter.");
  try {
    const result = await getDbPool().query(
      `SELECT u.id, u.name, u.email, u."emailVerified", u."createdAt",
              g.id AS grant_id, g.grant_batch_id, g.duration, g.prompt_tag,
              g.starts_at, g.expires_at,
              (g.id IS NOT NULL) AS has_active_grant
         FROM public."user" u
         LEFT JOIN LATERAL (
           SELECT id, grant_batch_id, duration, prompt_tag, starts_at, expires_at
             FROM public.balmz_complimentary_access_grants
            WHERE user_id = u.id AND revoked_at IS NULL AND starts_at <= now()
              AND (expires_at IS NULL OR expires_at > now())
            ORDER BY created_at DESC LIMIT 1
         ) g ON true
        WHERE u.role = 'user'
          AND ($1 = '' OR u.name ILIKE $2 OR u.email ILIKE $2)
          AND ($3 = 'all' OR ($3 = 'granted' AND g.id IS NOT NULL) OR ($3 = 'ungranted' AND g.id IS NULL))
          AND ($4 = 'all' OR ($4 = 'verified' AND u."emailVerified" = true) OR ($4 = 'unverified' AND u."emailVerified" = false))
        ORDER BY u."createdAt" DESC LIMIT 150`,
      [q, `%${q}%`, grantFilter, verifiedFilter],
    );
    return NextResponse.json({ users: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Family access account search is unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return fail("Administrator access is required.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return fail("Request body must be valid JSON."); }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (body.action === "revoke") {
      const grantId = typeof body.grantId === "string" ? body.grantId : "";
      if (!grantId) { await client.query("ROLLBACK"); return fail("Select a grant to revoke."); }
      const revoked = await client.query(
        `UPDATE public.balmz_complimentary_access_grants
            SET revoked_at = now(), updated_at = now()
          WHERE id = $1 AND revoked_at IS NULL
          RETURNING user_id, grant_batch_id`,
        [grantId],
      );
      if (!revoked.rowCount) { await client.query("ROLLBACK"); return fail("That access grant is no longer active.", 404); }
      await client.query(
        `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, target_user_id, metadata)
         VALUES ($1, $2, 'family_access_revoked', $3, $4::jsonb)`,
        [randomUUID(), admin.user.id, revoked.rows[0].user_id, JSON.stringify({ grantBatchId: revoked.rows[0].grant_batch_id })],
      );
      await client.query("COMMIT");
      return NextResponse.json({ success: true, revoked: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const userIds = Array.isArray(body.userIds) ? [...new Set(body.userIds.filter((v): v is string => typeof v === "string" && v.length > 0))] : [];
    const duration = typeof body.duration === "string" ? body.duration : "";
    const promptTag = typeof body.promptTag === "string" ? body.promptTag.trim() : "";
    const sharedPrompt = typeof body.sharedPrompt === "string" ? body.sharedPrompt.trim() : "";
    if (!userIds.length || userIds.length > 100) { await client.query("ROLLBACK"); return fail("Select between 1 and 100 registered users."); }
    if (!DURATIONS.has(duration)) { await client.query("ROLLBACK"); return fail("Choose a supported access duration."); }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(promptTag)) { await client.query("ROLLBACK"); return fail("Prompt tag must be 1–80 letters, numbers, underscores or hyphens."); }
    if (sharedPrompt.length < 10 || sharedPrompt.length > 4000) { await client.query("ROLLBACK"); return fail("Shared prompt must be between 10 and 4,000 characters."); }

    const selected = await client.query<{ id: string }>(
      `SELECT id FROM public."user" WHERE id = ANY($1::text[]) AND role = 'user' FOR UPDATE`,
      [userIds],
    );
    if (selected.rowCount !== userIds.length) { await client.query("ROLLBACK"); return fail("One or more selected accounts were not found or are not standard user accounts."); }

    const batchId = randomUUID();
    for (const user of selected.rows) {
      await client.query(
        `UPDATE public.balmz_complimentary_access_grants
            SET revoked_at = now(), updated_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
      );
      await client.query(
        `INSERT INTO public.balmz_complimentary_access_grants
           (id, grant_batch_id, user_id, granted_by_user_id, grant_type, duration,
            prompt_tag, shared_prompt, starts_at, expires_at)
         VALUES ($1, $2, $3, $4, 'family', $5, $6, $7, now(),
           CASE $5
             WHEN 'week' THEN now() + interval '7 days'
             WHEN '1_month' THEN now() + interval '1 month'
             WHEN '3_months' THEN now() + interval '3 months'
             WHEN '6_months' THEN now() + interval '6 months'
             WHEN '9_months' THEN now() + interval '9 months'
             WHEN '1_year' THEN now() + interval '1 year'
             ELSE NULL
           END)`,
        [randomUUID(), batchId, user.id, admin.user.id, duration, promptTag, sharedPrompt],
      );
    }
    await client.query(
      `INSERT INTO public.balmz_admin_audit_log (id, actor_user_id, action, metadata)
       VALUES ($1, $2, 'family_access_granted', $3::jsonb)`,
      [randomUUID(), admin.user.id, JSON.stringify({ grantBatchId: batchId, userIds, duration, promptTag, recipients: selected.rowCount })],
    );
    await client.query("COMMIT");
    return NextResponse.json({ success: true, grantBatchId: batchId, recipients: selected.rowCount }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    return fail("The family access grant could not be saved. No account passwords or chat histories were changed.", 503);
  } finally {
    client.release();
  }
}
