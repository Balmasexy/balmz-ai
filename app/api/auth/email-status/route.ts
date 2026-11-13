import { NextResponse } from "next/server";
import { isTransactionalEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = isTransactionalEmailConfigured();
  return NextResponse.json(
    { enabled, verificationRequired: enabled, passwordResetAvailable: enabled },
    { headers: { "Cache-Control": "no-store" } },
  );
}
