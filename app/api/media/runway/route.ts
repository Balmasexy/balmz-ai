import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getDbPool } from "@/lib/db";
import { consumeUsage, getCurrentSubscription } from "@/lib/subscriptions";
import { getRunwayClient, getRunwayPublicError } from "@/lib/ai/runway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA_PREFIX = "BALMZ Runway Media · ";
type MediaMode = "image" | "text-to-video" | "image-to-video";
type MediaStatus = "SUBMITTING" | "PENDING" | "THROTTLED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

type MediaRecord = {
  id: string;
  requestId: string;
  mode: MediaMode;
  prompt: string;
  model: string;
  ratio: "landscape" | "portrait" | "square";
  duration?: number;
  taskId: string | null;
  status: MediaStatus;
  progress?: number;
  output: string[];
  error: string | null;
  estimatedCredits?: number;
  creditsUsed?: number;
  createdAt: string;
};

function jsonError(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } });
}

function safeParseRecord(content: string): MediaRecord | null {
  try {
    const value = JSON.parse(content) as Partial<MediaRecord>;
    if (
      !value || typeof value.id !== "string" || typeof value.requestId !== "string" ||
      !["image", "text-to-video", "image-to-video"].includes(String(value.mode)) ||
      typeof value.prompt !== "string" || typeof value.status !== "string" ||
      !Array.isArray(value.output)
    ) return null;
    return value as MediaRecord;
  } catch {
    return null;
  }
}

function validImageInput(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 7_000_000) return false;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || !host.includes(".") || isIP(host)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

function usageError(error: unknown) {
  const code = error instanceof Error ? error.message : "USAGE_UNAVAILABLE";
  if (["ACTIVE_SUBSCRIPTION_REQUIRED", "USAGE_LIMIT_NOT_CONFIGURED", "USAGE_LIMIT_EXCEEDED"].includes(code)) {
    return jsonError("AI_ALLOWANCE_UNAVAILABLE", "Your active plan does not have enough AI message allowance for this generation.", 402);
  }
  return jsonError("USAGE_UNAVAILABLE", "Your AI allowance could not be reserved. No Runway request was sent.", 503);
}

function jobResponse(record: MediaRecord) {
  return {
    jobId: record.id,
    mode: record.mode,
    prompt: record.prompt,
    model: record.model,
    ratio: record.ratio,
    duration: record.duration ?? null,
    status: record.status,
    progress: record.progress ?? null,
    output: record.output,
    error: record.error,
    estimatedCredits: record.estimatedCredits ?? null,
    creditsUsed: record.creditsUsed ?? null,
    createdAt: record.createdAt,
  };
}

async function updateRecord(userId: string, record: MediaRecord) {
  await getDbPool().query(
    `UPDATE public.balmz_notes
        SET content = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND title = $4`,
    [record.id, userId, JSON.stringify(record), MEDIA_PREFIX + record.id],
  );
}

export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return jsonError("UNAUTHORIZED", "Sign in to use Runway media generation.", 401);

  const runway = getRunwayClient();
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (jobId) {
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return jsonError("INVALID_JOB_ID", "That media job ID is invalid.", 400);
    const saved = await getDbPool().query<{ content: string; title: string }>(
      `SELECT content, title
         FROM public.balmz_notes
        WHERE id = $1 AND user_id = $2 AND title = $3
        LIMIT 1`,
      [jobId, session.user.id, MEDIA_PREFIX + jobId],
    );
    const record = saved.rows[0] ? safeParseRecord(saved.rows[0].content) : null;
    if (!record) return jsonError("MEDIA_JOB_NOT_FOUND", "This media job was not found in your account.", 404);

    if (!record.taskId || record.status === "SUBMITTING" || record.status === "FAILED") {
      return NextResponse.json({ job: jobResponse(record) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!runway) return jsonError("RUNWAY_NOT_CONFIGURED", "Runway is not configured on the BALMZ AI server.", 503);

    try {
      const task = await runway.tasks.retrieve(record.taskId);
      record.status = task.status as MediaStatus;
      if (task.status === "RUNNING") record.progress = task.progress;
      if (task.status === "SUCCEEDED") {
        record.output = task.output.filter((url) => typeof url === "string" && url.startsWith("https://"));
        record.creditsUsed = task.cost.credits;
        record.error = null;
      } else if (task.status === "FAILED") {
        record.error = "Runway could not finish this media job. Try again with a revised prompt or input image.";
      } else if (task.status === "CANCELLED") {
        record.error = "This Runway media job was cancelled.";
      }
      await updateRecord(session.user.id, record);
      return NextResponse.json({ job: jobResponse(record) }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const safe = getRunwayPublicError(error);
      return jsonError(safe.code, safe.message, safe.status);
    }
  }

  const result = await getDbPool().query<{ id: string; content: string; title: string; created_at: Date }>(
    `SELECT id, content, title, created_at
       FROM public.balmz_notes
      WHERE user_id = $1 AND title LIKE $2
      ORDER BY created_at DESC
      LIMIT 12`,
    [session.user.id, MEDIA_PREFIX + "%"],
  );
  const jobs = result.rows.flatMap((row) => {
    const record = safeParseRecord(row.content);
    return record ? [jobResponse(record)] : [];
  });
  return NextResponse.json({
    provider: "Runway",
    configured: Boolean(runway),
    jobs,
    outputNotice: "Runway output links are temporary and generally expire within 24–48 hours. Download completed media promptly.",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return jsonError("UNAUTHORIZED", "Sign in to generate media.", 401);

  const runway = getRunwayClient();
  if (!runway) return jsonError("RUNWAY_NOT_CONFIGURED", "Add RUNWAYML_API_SECRET to the BALMZ AI Render service environment.", 503);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return jsonError("INVALID_JSON", "The request body must be valid JSON.", 400); }

  const mode = body.mode;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const ratio = body.ratio === "portrait" || body.ratio === "square" ? body.ratio : "landscape";
  const duration = Number(body.duration ?? 5);
  const requestId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId)
    ? body.requestId
    : randomUUID();

  if (mode !== "image" && mode !== "text-to-video" && mode !== "image-to-video") {
    return jsonError("INVALID_MEDIA_MODE", "Choose image, text-to-video or image-to-video generation.", 400);
  }
  if (!prompt || prompt.length > 1000) {
    return jsonError("INVALID_PROMPT", "Enter a prompt between 1 and 1,000 characters.", 400);
  }
  if ((mode === "text-to-video" || mode === "image-to-video") && (!Number.isInteger(duration) || duration < 2 || duration > 10)) {
    return jsonError("INVALID_DURATION", "Video duration must be between 2 and 10 seconds for this model.", 400);
  }
  const imageInput = body.imageInput;
  if (mode === "image-to-video" && !validImageInput(imageInput)) {
    return jsonError("INVALID_INPUT_IMAGE", "Choose a PNG, JPEG or WebP image under 4 MB, or supply a public HTTPS image URL.", 400);
  }

  let subscription;
  try { subscription = await getCurrentSubscription(session.user.id); }
  catch { return jsonError("SUBSCRIPTION_UNAVAILABLE", "Your plan could not be checked. No Runway request was sent.", 503); }
  if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    return jsonError("ACTIVE_PLAN_REQUIRED", "An active BALMZ AI plan is required to generate media.", 402);
  }

  const record: MediaRecord = {
    id: requestId,
    requestId,
    mode: mode as MediaMode,
    prompt,
    model: mode === "image" ? "gen4_image" : "gen4.5",
    ratio,
    duration: mode === "image" ? undefined : duration,
    taskId: null,
    status: "SUBMITTING",
    output: [],
    error: null,
    createdAt: new Date().toISOString(),
  };

  let inserted: { id: string } | undefined;
  try {
    const reserved = await getDbPool().query<{ id: string }>(
      `INSERT INTO public.balmz_notes (id, user_id, title, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [record.id, session.user.id, MEDIA_PREFIX + record.id, JSON.stringify(record)],
    );
    inserted = reserved.rows[0];
  } catch {
    return jsonError("MEDIA_JOB_SAVE_FAILED", "The media job could not be reserved in your account. No Runway request was sent.", 503);
  }

  if (!inserted) {
    const existing = await getDbPool().query<{ content: string }>(
      `SELECT content FROM public.balmz_notes
        WHERE id = $1 AND user_id = $2 AND title = $3
        LIMIT 1`,
      [record.id, session.user.id, MEDIA_PREFIX + record.id],
    );
    const previous = existing.rows[0] ? safeParseRecord(existing.rows[0].content) : null;
    if (previous) {
      return NextResponse.json({ job: jobResponse(previous), duplicate: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return jsonError("REQUEST_ID_CONFLICT", "This request ID is already in use. Start a new generation.", 409);
  }

  try {
    await consumeUsage({
      userId: session.user.id,
      metric: "ai_messages",
      units: 1,
      source: mode === "image" ? "runway_image_generation" : "runway_video_generation",
      idempotencyKey: requestId + ":runway:" + String(mode),
    });
  } catch (error) {
    record.status = "FAILED";
    record.error = "Your account does not have an available AI generation allowance for this action.";
    await updateRecord(session.user.id, record).catch(() => undefined);
    return usageError(error);
  }

  try {
    let created: { id: string; estimatedCost?: { credits?: number } };
    if (mode === "image") {
      created = await runway.textToImage.create({
        model: "gen4_image",
        promptText: prompt,
        ratio: ratio === "portrait" ? "1080:1920" : ratio === "square" ? "1024:1024" : "1360:768",
      });
    } else if (mode === "text-to-video") {
      created = await runway.textToVideo.create({
        model: "gen4.5",
        promptText: prompt,
        ratio: ratio === "portrait" ? "720:1280" : "1280:720",
        duration,
      });
    } else {
      created = await runway.imageToVideo.create({
        model: "gen4.5",
        promptImage: imageInput as string,
        promptText: prompt,
        ratio: ratio === "portrait" ? "720:1280" : "1280:720",
        duration,
      });
    }
    record.taskId = created.id;
    record.status = "PENDING";
    record.estimatedCredits = created.estimatedCost?.credits;
    await updateRecord(session.user.id, record);
    return NextResponse.json({ job: jobResponse(record) }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = getRunwayPublicError(error);
    record.status = "FAILED";
    record.error = safe.message;
    await updateRecord(session.user.id, record).catch(() => undefined);
    return jsonError(safe.code, safe.message, safe.status);
  }
}
