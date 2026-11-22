import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { createR2PresignedUrl, createR2ProjectObjectKey, deleteR2ProjectObject, isR2Configured, listR2WorkspaceObjects } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}
function unavailable() {
  return NextResponse.json({ configured: false, bucket: null, objects: [], listedBytes: 0, truncated: false, message: "Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME to the BALMZ AI Render service. The connection is shared by this Deployment Workplace; individual project services do not need their own R2 credentials." }, { headers: { "Cache-Control": "no-store" } });
}
function validProject(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}
function validProjectKey(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("projects/") && value.length <= 1024 && !value.includes(String.fromCharCode(0)) && value.split("/").every((part) => part !== "." && part !== "..");
}

export async function GET() {
  const denied = await authorized();
  if (denied) return denied;
  if (!isR2Configured()) return unavailable();
  try {
    const result = await listR2WorkspaceObjects();
    return NextResponse.json({ configured: true, provider: "Cloudflare R2", bucket: process.env.R2_BUCKET_NAME, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STORAGE_UNAVAILABLE";
    return NextResponse.json({ configured: true, error: code.startsWith("R2_LIST_FAILED_") ? code : "STORAGE_UNAVAILABLE", message: "Cloudflare R2 could not list the projects/ namespace. Check the bucket and Object Read permission." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const denied = await authorized();
  if (denied) return denied;
  if (!isR2Configured()) return unavailable();
  let body: { action?: unknown; project?: unknown; fileName?: unknown; contentType?: unknown; key?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  try {
    if (body.action === "upload-url") {
      if (!validProject(body.project) || typeof body.fileName !== "string" || body.fileName.length < 1 || body.fileName.length > 240) return NextResponse.json({ error: "INVALID_UPLOAD" }, { status: 400 });
      const contentType = typeof body.contentType === "string" && body.contentType.length <= 160 ? body.contentType : "application/octet-stream";
      const key = createR2ProjectObjectKey(body.project, body.fileName);
      return NextResponse.json({ success: true, key, ...createR2PresignedUrl("PUT", key, contentType) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "download-url") {
      if (!validProjectKey(body.key)) return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 400 });
      return NextResponse.json({ success: true, ...createR2PresignedUrl("GET", body.key) }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STORAGE_UNAVAILABLE";
    return NextResponse.json({ error: code === "R2_NOT_CONFIGURED" ? code : "STORAGE_SIGNING_FAILED", message: "A secure project file transfer URL could not be created." }, { status: 502 });
  }
}

export async function DELETE(request: Request) {
  const denied = await authorized();
  if (denied) return denied;
  if (!isR2Configured()) return unavailable();
  let body: { key?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }
  if (!validProjectKey(body.key)) return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 400 });
  try {
    await deleteR2ProjectObject(body.key);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "STORAGE_DELETE_FAILED", message: "The project file could not be deleted." }, { status: 502 });
  }
}
