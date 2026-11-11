import { getDbPool } from "@/lib/db";

export type ComplimentaryAccessContext = {
  id: string;
  grantBatchId: string;
  duration: string;
  promptTag: string;
  sharedPrompt: string;
  startsAt: Date;
  expiresAt: Date | null;
};

export async function getActiveComplimentaryAccess(userId: string): Promise<ComplimentaryAccessContext | null> {
  const result = await getDbPool().query<{
    id: string; grant_batch_id: string; duration: string; prompt_tag: string;
    shared_prompt: string; starts_at: Date; expires_at: Date | null;
  }>(
    `SELECT id, grant_batch_id, duration, prompt_tag, shared_prompt, starts_at, expires_at
       FROM public.balmz_complimentary_access_grants
      WHERE user_id = $1 AND revoked_at IS NULL AND starts_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const grant = result.rows[0];
  if (!grant) return null;
  return {
    id: grant.id, grantBatchId: grant.grant_batch_id, duration: grant.duration,
    promptTag: grant.prompt_tag, sharedPrompt: grant.shared_prompt,
    startsAt: grant.starts_at, expiresAt: grant.expires_at,
  };
}
