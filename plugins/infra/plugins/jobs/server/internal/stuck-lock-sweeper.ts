import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { reportServerError } from "@plugins/framework/plugins/server-core/core";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { jobLockHeldExpr, jobNameExpr } from "./introspection";

// Recovery floor for jobs that were mid-execution when their worker died
// uncleanly (SIGKILL, OOM-killer, kernel panic, `process.exit()` from a
// buggy handler — anything that bypasses our SIGTERM/SIGINT shutdown path).
//
// Clean restarts are already handled: `runner.stop()` waits for in-flight
// handlers to finish, so locks clear naturally. This sweeper is the
// safety net for the rest.
//
// Why we need it at all: graphile-worker 0.16.6 hardcodes the lock-recovery
// threshold to 4 hours in SQL (`resetLockedAt.js:12`, `sql/000005.sql:124`) and
// exposes no runtime override, so a crashed worker's jobs sit unrunnable for up
// to 4h. We run our own reclaim instead; it races harmlessly with graphile's.
//
// WHAT CHANGED, and why it is not a tuning knob any more: this used to reclaim a
// row because its `locked_at` was OLD (5 minutes). An age cannot distinguish a
// dead worker from a busy one, so every handler that ran longer than the
// threshold — a large upload, a `pg_dump`/`pg_restore`, a `./singularity push`,
// a long git checkout — had its still-live work reclaimed and re-dispatched
// CONCURRENTLY with itself. It now reclaims a row because a worker is provably
// NOT running it: no session holds its advisory lock (`jobLockHeldExpr`), a fact
// Postgres maintains and releases as part of backend teardown. See
// `job-lock.ts` and `research/2026-07-30-jobs-exact-liveness-advisory-locks.md`.
//
// Why this stays a raw setInterval and NOT a scheduled `defineJob`: it is the
// recovery mechanism FOR the job system. Routing it through graphile's own
// queue would mean a wedged worker (the exact failure this clears) couldn't
// run its own recovery — a deadlock. Infra that recovers the job system must
// not depend on the job system.

// The ONE residual timestamp in this design, and it does NOT bound handler
// runtime — it bounds ACQUISITION LATENCY, which is a constant of the dispatch
// path. Graphile stamps `locked_at` inside `get_job`; `withJobLock` takes the
// advisory lock a few milliseconds later in `dispatch()`. A row observed inside
// that window has `locked_at` set and no lock yet, and would otherwise look
// abandoned. So we only consider rows whose lock has had this long to appear.
//
// Read that difference carefully before touching this constant: a six-hour
// handler is exactly as safe as a 200 ms one, because nothing here grows with
// handler duration and nothing a job author writes can violate it. If a job
// ever looks "stuck", the answer is never to raise this number.
const LOCK_ACQUIRE_GRACE = "30 seconds";
const SWEEP_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startStuckLockSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runTracked("jobs:stuck-lock-sweep", () =>
      // eslint-disable-next-line promise-safety/no-bare-catch
      sweepOnce().catch((err) => {
        console.warn("[jobs] stuck-lock sweep failed", err);
      }),
    );
  }, SWEEP_INTERVAL_MS);
}

export function stopStuckLockSweeper(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

interface ReclaimedRow {
  id: string;
  job_name: string;
}

// Exported for the events-test crash-recovery endpoint, which forces a
// sweep instead of waiting up to a minute for the next tick.
//
// Deliberately NOT sweeping `graphile_worker._private_job_queues` (which the
// age-based version did): `defineJob`/`enqueue` expose no queue option, so
// nothing ever sets `queue_name` and the sweep was always a no-op — and if a
// named queue is ever adopted, clearing its lock would defeat the serialization
// that is the entire reason to have one.
export async function sweepOnce(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE graphile_worker._private_jobs j
       SET locked_at = NULL,
           locked_by = NULL,
           run_at = greatest(j.run_at, now())
     WHERE j.locked_at IS NOT NULL
       AND j.locked_at < now() - ${LOCK_ACQUIRE_GRACE}::interval
       AND NOT ${jobLockHeldExpr}
    RETURNING j.id::text AS id, ${jobNameExpr} AS job_name
  `);

  // Every reclaim is reported, never merely counted. A reclaim means a worker
  // died holding this row — real information about the health of this backend —
  // and a SILENT reclaim is precisely the failure mode that let the age-based
  // sweeper steal live jobs unnoticed for three months.
  for (const row of result.rows as unknown as ReclaimedRow[]) {
    const message = `[jobs] reclaimed ${row.job_name} (job ${row.id}) — locked with no live advisory lock holder; its worker died mid-run, re-queueing`;
    console.warn(message);
    reportServerError({ message, stack: null });
  }
}
