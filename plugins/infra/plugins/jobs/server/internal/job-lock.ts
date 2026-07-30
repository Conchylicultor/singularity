import { Pool } from "pg";
import { connectionString } from "@plugins/database/plugins/admin/server";
import { reportServerError } from "@plugins/framework/plugins/server-core/core";
import { JOB_CONCURRENCY } from "./constants";

// Exact liveness for a running job, maintained by Postgres itself.
//
// A session-scoped advisory lock is released the instant the owning backend goes
// away — SIGKILL, OOM-killer, kernel panic, `process.exit()` from a buggy handler
// alike — because releasing its locks is part of backend teardown when the client
// socket closes. So "is a worker still running this job?" stops being ESTIMATED
// from a clock and becomes a FACT the database maintains.
//
// That distinction is the whole design. Every previous mechanism here keyed off
// the age of `graphile_worker._private_jobs.locked_at`, and an age cannot tell
// "worker dead" from "worker busy" — so a 15-minute backup looked identical to a
// crashed worker and was re-dispatched WHILE STILL RUNNING (two complete archives
// per night for three months; 25 distinct jobs stolen across an 8-day window).
// The lease-renewal heartbeat that was supposed to prevent that could not: a lease
// is still a timeout, and machine sleep freezes every timer we own while `now()`
// keeps advancing, so on wake `locked_at` is hours stale on a perfectly live job.
// Nothing built on a clock we control can survive that; shared fate with the
// Postgres backend can. See
// `research/2026-07-30-jobs-exact-liveness-advisory-locks.md`.
//
// If you are here because a long job looks "stuck": do NOT reintroduce a timeout.
// The lock's absence is the only liveness signal, and it is exact.

// --- Why a dedicated pool and not the shared `db` handle ---------------------
//
// TWO independent reasons, either one fatal:
//
// 1. `db` routes through PgBouncer in TRANSACTION pooling mode, which does not
//    preserve session state between statements — the server connection is handed
//    to someone else the moment our transaction ends. A session-scoped advisory
//    lock taken on one statement would silently be invisible (or released) on the
//    next. `connectionString()` is the DIRECT 5433 socket, the same routing
//    graphile-worker and the change-feed LISTEN already require, and the routing
//    rule `plugins/database/plugins/pgbouncer/CLAUDE.md` already documents for
//    advisory locks.
// 2. Holding a `pool.connect()` lease for the WHOLE job body would pin one of only
//    `BACKGROUND_TX_MAX = 3` background transaction slots for minutes or hours.
//    The lane-capacity deadlock proof in `plugins/database/server/internal/client.ts`
//    assumes those leases are transaction-scoped; a handful of long jobs would
//    exhaust the lane and wedge every background transaction in the backend.
//
// Sized `max: JOB_CONCURRENCY` — at most one held connection per in-flight job, so
// this pool is structurally bounded by the worker's own slot count and a backend
// adds at most that many direct connections (measured headroom at design time:
// `max_connections = 500`, 57 in use).
let pool: Pool | null = null;

function lockPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString(),
      max: JOB_CONCURRENCY,
      // Only ever reaps connections sitting IDLE in the pool; a checked-out
      // client holding a lock is not idle and is never touched by this.
      idleTimeoutMillis: 30_000,
      // A pool whose entire purpose is job-scoped leases must never be the reason
      // the process refuses to exit: unref idle clients so shutdown is not held
      // open by a connection nobody is using.
      allowExitOnIdle: true,
    });
  }
  return pool;
}

// Returned instead of the handler's result when another live worker provably holds
// this job's lock. A unique symbol, not `null`/`undefined`/a falsy default: the
// caller CANNOT read it as a legitimate handler result, and TypeScript forces the
// branch (`Promise<T | typeof LOCK_HELD>` narrows only on an explicit `=== LOCK_HELD`).
// Under this design a contended dispatch should be near-impossible, so it is a real
// signal — see the caller in `worker.ts`, which reports it and re-queues the tick.
export const LOCK_HELD: unique symbol = Symbol("jobs.lock-held");

/**
 * Run `fn` while holding the exclusive session advisory lock for `jobId`.
 *
 * Returns {@link LOCK_HELD} — without running `fn` — if another live session
 * already holds it. `onLost` fires if this lock's connection dies mid-handler,
 * which means the lock is gone and the job is exposed to a double-run; it is a
 * notification, not a recovery hook (nothing can un-run a handler mid-flight).
 *
 * The key is the graphile job id, never a workflow run id: a suspended workflow
 * resumes as a DIFFERENT `_private_jobs` row, and locking the run id would make a
 * resumed step contend with its own suspended predecessor.
 */
export async function withJobLock<T>(
  jobId: string,
  onLost: (err: unknown) => void,
  fn: () => Promise<T>,
): Promise<T | typeof LOCK_HELD> {
  const client = await lockPool().connect();
  // Destroy-on-release rather than return-to-pool. A session that is destroyed
  // releases its locks unconditionally, so setting this on every uncertain path is
  // what makes "a lock can never be leaked back into the pool" true by
  // construction — the alternative (a reused client silently still holding an
  // advisory lock) would permanently block that job id with no visible symptom.
  let destroyOnRelease = false;
  const onClientError = (err: unknown) => {
    // An error surfaced on the client itself means the session is gone, and with
    // it the lock. Never swallow it: this is the exact moment the double-run
    // window opens, and the whole point of this design is that it is loud.
    destroyOnRelease = true;
    onLost(err);
  };
  client.on("error", onClientError);
  let acquired = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::bigint) AS locked",
      [jobId],
    );
    const row = rows[0];
    if (!row) {
      // `pg_try_advisory_lock` always returns exactly one row. No row means we do
      // not understand what we are talking to — fail loud rather than guess.
      throw new Error(
        `[jobs] pg_try_advisory_lock returned no row for job ${jobId}`,
      );
    }
    if (!row.locked) return LOCK_HELD;
    acquired = true;
    return await fn();
  } catch (err) {
    destroyOnRelease = true;
    throw err;
  } finally {
    // Skipped when the client already errored or the handler threw: in both cases
    // the connection is about to be destroyed, and teardown releases the lock more
    // reliably than a statement on a session we no longer trust.
    if (acquired && !destroyOnRelease) {
      try {
        const { rows } = await client.query<{ unlocked: boolean }>(
          "SELECT pg_advisory_unlock($1::bigint) AS unlocked",
          [jobId],
        );
        if (!rows[0]?.unlocked) {
          // We held it a statement ago and Postgres says we do not. Report it and
          // fall through to destroying the connection, which releases it anyway.
          destroyOnRelease = true;
          const message = `[jobs] pg_advisory_unlock reported no lock held for job ${jobId} — destroying the lock connection to release it`;
          console.warn(message);
          reportServerError({ message, stack: null });
        }
      // eslint-disable-next-line promise-safety/no-bare-catch -- the unlock is best-effort BECAUSE destroying the session below releases the lock unconditionally; rethrowing here would replace the handler's own outcome with a cleanup failure
      } catch (err) {
        destroyOnRelease = true;
        const errObj = err instanceof Error ? err : new Error(String(err));
        const message = `[jobs] advisory unlock failed for job ${jobId}: ${errObj.message} — destroying the lock connection to release it`;
        console.warn(message, errObj);
        reportServerError({
          message,
          stack: errObj.stack ?? null,
          errorType: errObj.name,
        });
      }
    }
    // Detach before release: the client goes back into the pool and is reused by
    // the next job, so leaving this listener attached would accumulate one stale
    // `onLost` per dispatch on the same connection and fire the wrong job's report.
    client.off("error", onClientError);
    client.release(destroyOnRelease);
  }
}
