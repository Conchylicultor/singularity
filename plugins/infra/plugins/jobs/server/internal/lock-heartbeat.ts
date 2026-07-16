import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@plugins/database/server";

// Lease keep-alive for a running job's graphile-worker lock.
//
// graphile-worker 0.16.6 stamps `_private_jobs.locked_at` exactly once — when a
// worker picks the job up — and never refreshes it while the handler runs. Every
// lock-recovery path keys off that timestamp's age: graphile's own 4h
// `resetLockedAt`, AND our tighter 5-minute stuck-lock sweeper
// (`stuck-lock-sweeper.ts`). So ANY handler whose `run()` does more than the
// threshold of continuous work — a large upload, a `pg_dump`/`pg_restore`, a
// `./singularity push`, a long git checkout — looks *stuck* to the sweeper,
// gets its lock reset, and is re-dispatched WHILE STILL RUNNING. That double-run
// is what filled `backup_runs` with duplicate hours-long Google Drive uploads
// and orphaned "running" rows.
//
// The fix is a lease heartbeat: while the handler runs, bump `locked_at` well
// inside the threshold so a HEALTHY long job is never confused with a dead one.
// Only a genuinely dead worker (its heartbeat stopped) lets `locked_at` go
// stale — so recovery still fires for real crashes, it just no longer steals
// live jobs. This makes the sweeper correct-by-construction for jobs of ANY
// duration, with no per-job configuration.
//
// Scoped by `locked_by = workerId`: if this job's lock was already stolen and
// reassigned (e.g. the heartbeat was starved for >5 min by a pathological GC
// pause), the row's `locked_by` no longer matches and the UPDATE is a harmless
// no-op — a stale heartbeat can never resurrect or extend another worker's lock.
//
// Interval sits well under the 5-minute sweep threshold: even several missed
// ticks (GC, event-loop stall) leave margin before a false steal.
//
// Why a raw `setInterval` and NOT a `defineJob`: this keeps the job system's own
// locks alive. Routing it through the queue it protects would be circular — the
// exact reasoning the stuck-lock sweeper documents for staying off-queue.
const HEARTBEAT_MS = 60_000;

export function startLockHeartbeat(jobId: string, workerId: string): () => void {
  let stopped = false;
  // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- pure lock keep-alive heartbeat: renews the job-system advisory lock; no attributable work, spanning it would be profiler noise
  const timer = setInterval(() => {
    // eslint-disable-next-line promise-safety/no-bare-catch
    db
      .execute(
        drizzleSql`
          UPDATE graphile_worker._private_jobs
             SET locked_at = now()
           WHERE id = ${jobId}::bigint AND locked_by = ${workerId}
        `,
      )
      .then((res) => {
        // A tick that renews 0 rows while the handler is still running means we
        // no longer hold this lock — the row was stolen/reassigned, or (a
        // regression signal) `workerId` stopped matching `locked_by`. Either way
        // the job is now exposed to a double-run, so surface it loudly rather
        // than let the heartbeat silently no-op. `stopped` guards the benign
        // tail race where the handler completed after this tick was dispatched.
        const renewed = (res as { rowCount?: number | null }).rowCount ?? 0;
        if (!stopped && renewed === 0) {
          console.warn(
            `[jobs] lock heartbeat renewed 0 rows for job ${jobId} (worker ${workerId}) — lock lost; job may double-run`,
          );
        }
      })
      .catch((err) => {
        // A failed renewal is non-fatal: at worst the lock ages toward the
        // sweep threshold and recovery behaves as it did before this heartbeat.
        console.warn("[jobs] lock heartbeat failed", jobId, err);
      });
  }, HEARTBEAT_MS);
  // The heartbeat must never keep the process alive on its own.
  timer.unref?.();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
