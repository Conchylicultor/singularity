import { sql as drizzleSql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { UNSAFE_sweepStuckLocks } from "@plugins/infra/plugins/jobs/server";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { db } from "@plugins/database/server";
import { logEntries, logPing, resetLog } from "./log-job";

// End-to-end check that an unclean-crash mid-handler recovers.
//
// Why this matters: graphile-worker's built-in lock recovery fires after
// 4 hours (hardcoded SQL), too slow to be a regression test. Our
// `stuck-lock-sweeper` shortens that to 5 min — this endpoint exercises
// the same code path against a synthesized "stuck" row instead of
// actually crashing the worker (which would take down the test harness).
//
// Steps: enqueue a job with a future `run_at` so the live worker doesn't
// claim it; mutate the row to look exactly like "worker died holding the
// lock 6 minutes ago" (locked_at + locked_by, attempts=1, run_at past);
// force one sweep; wait for the handler to actually run.
// NOTE: Not using implement() because retryUntil and error paths return raw Response objects.
export async function handleCrashRecovery(): Promise<Response> {
  resetLog();
  const label = `crash-recovery-${randomUUID()}`;

  const farFuture = new Date(Date.now() + 60 * 60 * 1000);
  await logPing.enqueue({ label }, { runAt: farFuture });

  // Find the row by payload — addJob doesn't return the private-table id.
  const result = await db.execute<{ id: string }>(drizzleSql`
    SELECT id FROM graphile_worker._private_jobs
     WHERE task_id = (
       SELECT id FROM graphile_worker._private_tasks
        WHERE identifier = 'jobs.run'
     )
       AND payload->'input'->>'label' = ${label}
     LIMIT 1
  `);
  const row = result.rows[0];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) {
    return Response.json(
      { ok: false, error: "enqueued row not found" },
      { status: 500 },
    );
  }

  // Synthesize "worker died 6 minutes into a run". `is_available` is a
  // generated column off (locked_at is null), so this also gates the live
  // worker from claiming it until the sweeper clears the lock.
  await db.execute(drizzleSql`
    UPDATE graphile_worker._private_jobs
       SET locked_at = now() - interval '6 minutes',
           locked_by = 'fake-dead-worker',
           attempts = 1,
           run_at = now() - interval '1 second'
     WHERE id = ${row.id}::bigint
  `);

  await UNSAFE_sweepStuckLocks();

  // Worker polls every 2s by default; give it enough headroom.
  return retryUntil(
    async () => logEntries.some((e) => e.label === label) ? Response.json({ ok: true, label }) : null,
    {
      delay: fixed(100),
      deadline: 8_000,
      onDeadline: () => Response.json({ ok: false, error: "handler did not run within 8s", label }, { status: 504 }),
    },
  );
}
