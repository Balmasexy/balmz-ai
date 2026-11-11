import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import {
  createR2ObjectKey,
  createR2PresignedUrl,
  deleteR2AdminObject,
  isR2Configured,
  listR2AdminObjects,
} from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!(await isAdminUser(session.user.id))) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  return null;
}

function notConfigured() {
  return NextResponse.json({
    configured: false,
    provider: "Cloudflare R2",
    objects: [],
    listedBytes: 0,
    truncated: false,
    message: "Connect a private Cloudflare R2 bucket by adding the four R2 storage secrets to the BALMZ AI Render service. No files are stored until the connection is configured.",
  }, { headers: { "Cache-Control": "no-store" } });
}

function validAdminKey(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("admin/") && value.length <= 1024 && !value.includes(String.fromCharCode(0));
}

export async function GET() {
  const denied = await authorized();
  if (denied) return denied;
  if (!isR2Configured()) return notConfigured();

  try {
    const result = await listR2AdminObjects();
    return NextResponse.json({
      configured: true,
      provider: "Cloudflare R2",
      bucket: process.env.R2_BUCKET_NAME,
      ...result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "STORAGE_UNAVAILABLE";
    return NextResponse.json({
      configured: true,
      error: message.startsWith("R2_LIST_FAILED_") ? message : "STORAGE_UNAVAILABLE",
      message: "The storage provider could not list this bucket. Check its bucket name, credentials, and Object Read & Write permission.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const denied = await authorized();
  if (denied) return denied;
  if (!isR2Configured()) return notConfigured();

  let body: { action?: unknown; fileName?: unknown; contentType?: unknown; key?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    if (body.action === "upload-url") {
      if (typeof body.fileName !== "string" || body.fileName.length < 1 || body.fileName.length > 240) {
        return NextResponse.json({ error: "INVALID_FILE_NAME" }, { status: 400 });
      }
      const contentType = typeof body.contentType === "string" && body.contentType.length <= 160
        ? body.contentType
        : "application/octet-stream";
      const key = createR2ObjectKey(body.fileName);
      const signed = createR2PresignedUrl("PUT", key, contentType);
      return NextResponse.json({ success: true, key, ...signed }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (body.action === "download-url") {
      if (!validAdminKey(body.key)) return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 400 });
      const signed = createR2PresignedUrl("GET", body.key);
      return NextResponse.json({ success: true, ...signed }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "STORAGE_UNAVAILABLE";
    return NextResponse.json({
      error: code === "R2_NOT_CONFIGURED" ? code : "STORAGE_SIGNING_FAILED",
      message: "A secure file transfer URL could not be created. Check the R2 credentials and try again.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  const denied = await authorized();
  if (denied) return denied;
  if (!isR2Configured()) return notConfigured();

  let body: { key?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!validAdminKey(body.key)) return NextResponse.json({ error: "INVALID_OBJECT_KEY" }, { status: 400 });

  try {
    await deleteR2AdminObject(body.key);
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "STORAGE_DELETE_FAILED",
      message: "The object could not be deleted. Refresh the list and try again.",
    }, { status: 502 });
  }
}
