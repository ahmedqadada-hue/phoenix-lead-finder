// PostgreSQL-backed job queue (no Redis needed). Workers claim jobs with
// FOR UPDATE SKIP LOCKED, so several workers can run safely side by side.
import type { BackgroundJob, Prisma } from "@prisma/client";
import { db } from "./db";

export const JOB_TYPES = ["SEARCH", "ENRICH", "ANALYZE"] as const;

export async function enqueue(job: { organizationId: string; type: string; payload: Prisma.InputJsonValue; campaignId?: string | null; dedupeKey?: string; runAt?: Date; maxAttempts?: number }) {
  try {
    return await db.backgroundJob.create({ data: { organizationId: job.organizationId, type: job.type, payload: job.payload, campaignId: job.campaignId ?? null, dedupeKey: job.dedupeKey, runAt: job.runAt ?? new Date(), maxAttempts: job.maxAttempts ?? 3 } });
  } catch (e: any) {
    if (e?.code === "P2002") return null; // identical job already queued: do not duplicate work
    throw e;
  }
}

/** Claims the next due job. Jobs of paused campaigns stay queued untouched. */
export async function claimNext(): Promise<BackgroundJob | null> {
  const rows = await db.$queryRaw<BackgroundJob[]>`
    UPDATE "BackgroundJob" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM "BackgroundJob" j
      LEFT JOIN "Campaign" c ON c.id = j."campaignId"
      WHERE j.status = 'PENDING' AND j."runAt" <= now() AND (j."campaignId" IS NULL OR c.status = 'RUNNING')
      ORDER BY j."runAt", j."createdAt"
      FOR UPDATE OF j SKIP LOCKED LIMIT 1
    ) RETURNING *`;
  return rows[0] ?? null;
}

export async function completeJob(id: string, result: Prisma.InputJsonValue) {
  await db.backgroundJob.update({ where: { id }, data: { status: "DONE", finishedAt: new Date(), result, error: null, lockedAt: null } });
}

export function backoffMs(attempts: number): number {
  return Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

/** Retries temporary failures with exponential backoff, never more than maxAttempts. */
export async function failJob(job: Pick<BackgroundJob, "id" | "attempts" | "maxAttempts">, error: string, retryable: boolean): Promise<"RETRY" | "FAILED"> {
  if (retryable && job.attempts < job.maxAttempts) {
    await db.backgroundJob.update({ where: { id: job.id }, data: { status: "PENDING", runAt: new Date(Date.now() + backoffMs(job.attempts)), error: error.slice(0, 1000), lockedAt: null } });
    return "RETRY";
  }
  await db.backgroundJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: error.slice(0, 1000), lockedAt: null } });
  return "FAILED";
}

/** Jobs whose worker died mid-run are returned to the queue (or failed once out of attempts). */
export async function recoverStaleJobs(olderThanMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const failed = await db.$executeRaw`UPDATE "BackgroundJob" SET status = 'FAILED', "finishedAt" = now(), error = 'Worker stopped while running this job', "lockedAt" = NULL WHERE status = 'RUNNING' AND "lockedAt" < ${cutoff} AND attempts >= "maxAttempts"`;
  const requeued = await db.$executeRaw`UPDATE "BackgroundJob" SET status = 'PENDING', "lockedAt" = NULL WHERE status = 'RUNNING' AND "lockedAt" < ${cutoff} AND attempts < "maxAttempts"`;
  return failed + requeued;
}
