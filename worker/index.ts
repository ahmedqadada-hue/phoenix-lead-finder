// Background worker. Runs on the server as its own process, independently of
// any browser: it executes discovery jobs, starts scheduled campaigns and
// recovers jobs left behind by a crash.
import { db } from "../src/lib/db";
import { claimNext, recoverStaleJobs } from "../src/lib/jobs";
import { runJob, runScheduler } from "../src/lib/discovery/engine";

const IDLE_MS = 3000;
const PAUSE_BETWEEN_JOBS_MS = 400; // polite pacing towards websites and free APIs
let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

async function main() {
  log("worker started");
  let lastHousekeeping = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastHousekeeping > 60_000) {
        lastHousekeeping = Date.now();
        const recovered = await recoverStaleJobs();
        const started = await runScheduler();
        await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
        if (recovered || started) log("housekeeping", { recovered, scheduledCampaignsStarted: started });
      }
      const job = await claimNext();
      if (!job) { await sleep(IDLE_MS); continue; }
      const t0 = Date.now();
      await runJob(job);
      const after = await db.backgroundJob.findUnique({ where: { id: job.id }, select: { status: true, error: true } });
      log("job", { id: job.id, type: job.type, status: after?.status, ms: Date.now() - t0, ...(after?.error ? { error: after.error.slice(0, 200) } : {}) });
      await sleep(PAUSE_BETWEEN_JOBS_MS);
    } catch (e) {
      log("worker loop error", { error: e instanceof Error ? e.message : String(e) });
      await sleep(5000);
    }
  }
  await db.$disconnect();
  log("worker stopped");
}

for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { stopping = true; });
main().catch((e) => { console.error(e); process.exit(1); });
