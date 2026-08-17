import { sql as drizzleSql } from "drizzle-orm";
import { db } from "@plugins/database/server";

// Raw reads of graphile's own tables, shared by the two queue-level endpoints.
//
// The jobs plugin's public introspection (`queryRunningJobs`) is the right read
// for LIVENESS and is used for exactly that — but it says nothing about queues,
// because nothing in the app has needed to ask until now. So the two facts these
// tests are about — which serialization queue a row landed in, and whether that
// queue is locked — are read here, in one place, rather than re-typed per
// endpoint. `crash-recovery.ts` already reaches into `_private_jobs` the same way
// to find the row it just enqueued.

/** One `events_test.serial` row, plus the queue it was filed under. */
export interface SerialJobRow {
  jobId: string;
  label: string;
  /** `locked_at IS NOT NULL` — graphile handed this row to a worker, so it is
   * holding a slot from the shared pool. The whole point of `serial` is that the
   * rows waiting behind a busy queue are NOT in this state. */
  locked: boolean;
  /** NULL here is the silent failure `serial` is meant to prevent: a row with no
   * queue is fetched regardless of who else is running. */
  queueId: string | null;
  queueName: string | null;
  queueLocked: boolean;
}

interface SerialJobRowSql {
  job_id: string;
  label: string;
  locked: boolean;
  queue_id: string | null;
  queue_name: string | null;
  queue_locked: boolean;
}

/** Every row this harness invocation enqueued, oldest first. Scoped by the
 * `run` field the test bakes into each payload, so two concurrent invocations
 * (or a leftover row from an earlier one) cannot be mistaken for each other. */
export async function readSerialRows(run: string): Promise<SerialJobRow[]> {
  const result = await db.execute(drizzleSql`
    SELECT j.id::text                    AS job_id,
           j.payload->'input'->>'label'  AS label,
           (j.locked_at IS NOT NULL)     AS locked,
           j.job_queue_id::text          AS queue_id,
           q.queue_name                  AS queue_name,
           (q.locked_at IS NOT NULL)     AS queue_locked
      FROM graphile_worker._private_jobs j
      LEFT JOIN graphile_worker._private_job_queues q ON q.id = j.job_queue_id
     WHERE j.task_id = (
             SELECT id FROM graphile_worker._private_tasks
              WHERE identifier = 'jobs.run'
           )
       AND j.payload->'input'->>'run' = ${run}
     ORDER BY j.id
  `);
  return (result.rows as unknown as SerialJobRowSql[]).map((r) => ({
    jobId: r.job_id,
    label: r.label,
    locked: r.locked,
    queueId: r.queue_id,
    queueName: r.queue_name,
    queueLocked: r.queue_locked,
  }));
}

export interface QueueLockState {
  queueName: string;
  locked: boolean;
  lockedBy: string | null;
}

/** The lock state of one `_private_job_queues` row. Read separately from the job
 * rows because the queue outlives them: after a job completes graphile deletes
 * its row but keeps the queue. */
export async function readQueueLock(
  queueId: string,
): Promise<QueueLockState | null> {
  const result = await db.execute(drizzleSql`
    SELECT q.queue_name                AS queue_name,
           (q.locked_at IS NOT NULL)   AS locked,
           q.locked_by                 AS locked_by
      FROM graphile_worker._private_job_queues q
     WHERE q.id = ${queueId}::int
  `);
  const row = (
    result.rows as unknown as {
      queue_name: string;
      locked: boolean;
      locked_by: string | null;
    }[]
  )[0];
  if (!row) return null;
  return {
    queueName: row.queue_name,
    locked: row.locked,
    lockedBy: row.locked_by,
  };
}

/** A fixed wait, used only where the assertion is that something does NOT
 * happen — there is no event to wait for, so the settle window IS the test. */
export function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Same shape as `crash-recovery.ts`: the first failed assertion is reported as
 * a named step rather than thrown, so a failing run reads as a verdict. */
export function fail(
  step: string,
  detail: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json(
    { ok: false, step, error: detail, ...extra },
    { status: 500 },
  );
}
