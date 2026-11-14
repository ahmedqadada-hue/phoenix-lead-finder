"use server";
import { requireUser } from "@/lib/auth";
import { workFor } from "@/lib/discovery/engine";

/** Runs queued jobs for a few seconds on behalf of a signed-in user.
 *  Only used on serverless hosting, where there is no separate worker process. */
export async function pumpJobsAction(): Promise<{ processed: number; remaining: number }> {
  await requireUser();
  if (!process.env.VERCEL && process.env.SERVERLESS_WORKER !== "1") return { processed: 0, remaining: 0 };
  return workFor(20_000, { housekeeping: true });
}
