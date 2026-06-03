import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@plugins/database/server";

// Recovery floor for jobs that were mid-execution when their worker died
// uncleanly (SIGKILL, OOM-killer, kernel panic, `process.exit()` from a
// buggy handler — anything that bypasses our SIGTERM/SIGINT shutdown path).
//
// Clean restarts are already handled: `runner.stop()` waits for in-flight
// handlers to finish, so locks clear naturally. This sweeper is the
// safety net for the rest.
//
// Why we need it: graphile-worker 0.16.6 hardcodes the lock-recovery
// threshold to 4 hours in SQL (`resetLockedAt.js:12`, `sql/000005.sql:124`)
// and exposes no runtime override. The Node-side `getJob()` doesn't pass
// `job_expiry` either. So we run our own UPDATE with a tighter threshold;
// it races harmlessly with graphile's own sweeper (theirs is a strict
// subset — anything 4h old is also 5 min old).
//
// Knob trade-off: lower threshold = faster recovery but higher chance a
// healthy-but-slow worker (long DB query, GC pause, network blip) gets its
// job stolen and double-runs. 5 min is well above realistic handler
// durations; if we ever want sub-minute recovery, we'd also need to wire
// graphile's heartbeat (currently implicit) into the threshold check.
//
// Why this stays a raw setInterval and NOT a scheduled `defineJob`: it is the
// recovery mechanism FOR the job system. Routing it through graphile's own
// queue would mean a wedged worker (the exact failure this clears) couldn't
// run its own recovery — a deadlock. Infra that recovers the job system must
// not depend on the job system.
const STUCK_LOCK_THRESHOLD = "5 minutes";
const SWEEP_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startStuckLockSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    // eslint-disable-next-line promise-safety/no-bare-catch
    sweepOnce().catch((err) => {
      console.warn("[jobs] stuck-lock sweep failed", err);
    });
  }, SWEEP_INTERVAL_MS);
}

export function stopStuckLockSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Exported for the events-test crash-recovery endpoint, which forces a
// sweep instead of waiting up to a minute for the next tick.
export async function sweepOnce(): Promise<void> {
  await db.execute(drizzleSql.raw(`
    UPDATE graphile_worker._private_jobs
       SET locked_at = NULL,
           locked_by = NULL,
           run_at = greatest(run_at, now())
     WHERE locked_at < now() - interval '${STUCK_LOCK_THRESHOLD}'
  `));
  await db.execute(drizzleSql.raw(`
    UPDATE graphile_worker._private_job_queues
       SET locked_at = NULL,
           locked_by = NULL
     WHERE locked_at < now() - interval '${STUCK_LOCK_THRESHOLD}'
  `));
}
