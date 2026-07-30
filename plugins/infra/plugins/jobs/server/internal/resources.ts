import { desc, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource, defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  DeadJobsPayloadSchema,
  JobsPayloadSchema,
  type DeadJobsPayload,
  type JobsPayload,
  type JobState,
} from "../../core/resources";
import { JOB_TASK } from "./constants";
import { jobLockHeldExpr } from "./introspection";
import { _deadJobs } from "./tables";

interface GraphileJobRow {
  id: string;
  task_identifier: string;
  payload: { jobName?: string; input?: unknown } | null;
  queue_name: string | null;
  priority: number;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  // NULL for any row that is not locked — see the CASE in the query below.
  alive: boolean | null;
}

function deriveState(row: GraphileJobRow): JobState {
  if (row.locked_at !== null) return "running";
  if (row.attempts >= row.max_attempts) return "dead";
  if (row.attempts > 0) return "retrying";
  return "pending";
}

// `state` is what graphile believes (`locked_at` stamped ⇒ "running"); `alive`
// is whether a worker is actually still there, read straight off `pg_locks` via
// the shared `jobLockHeldExpr`. Surfacing both is the point: a row that is
// `running` with `alive = false` is exactly the "worker died mid-handler" case
// the stuck-lock sweeper exists to reclaim, and it is now visible in Debug →
// Queue instead of only inferable from a stale timestamp. Scoped by CASE to
// locked rows — asking "does a worker hold this row's lock" of a pending row has
// no meaning, and answering `false` there would read as a fault. The CASE also
// keeps the cost honest: only the taken branch is evaluated, so the pg_locks scan
// runs for the handful of locked rows, not all 500.
export async function loadJobsList(limit = 500): Promise<JobsPayload> {
  const result = await db.execute(
    sql`SELECT j.id::text,
               t.identifier AS task_identifier,
               j.payload,
               q.queue_name,
               j.priority,
               j.run_at, j.locked_at, j.locked_by,
               j.attempts, j.max_attempts, j.last_error,
               j.created_at, j.updated_at,
               CASE WHEN j.locked_at IS NULL THEN NULL ELSE ${jobLockHeldExpr} END AS alive
          FROM graphile_worker._private_jobs j
          JOIN graphile_worker._private_tasks t ON t.id = j.task_id
     LEFT JOIN graphile_worker._private_job_queues q ON q.id = j.job_queue_id
         WHERE t.identifier = ${JOB_TASK}
         ORDER BY j.run_at DESC
         LIMIT ${limit}`,
  );

  const rows = (result.rows as unknown as GraphileJobRow[]).map((r) => ({
    id: r.id,
    jobName: r.payload?.jobName ?? "(unknown)",
    input: r.payload?.input ?? null,
    state: deriveState(r),
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    runAt: r.run_at,
    lockedAt: r.locked_at,
    lockedBy: r.locked_by,
    alive: r.alive,
    queueName: r.queue_name,
    priority: r.priority,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const counts = { pending: 0, running: 0, retrying: 0, dead: 0 };
  for (const j of rows) counts[j.state]++;

  return { rows, counts };
}

export async function loadDeadJobsList(limit = 2000): Promise<DeadJobsPayload> {
  const rows = await db
    .select()
    .from(_deadJobs)
    .orderBy(desc(_deadJobs.archivedAt))
    .limit(limit);
  return {
    rows: rows.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      input: r.input ?? null,
      attempts: r.attempts,
      maxAttempts: r.maxAttempts,
      lastError: r.lastError,
      diedAt: r.diedAt instanceof Date ? r.diedAt.toISOString() : r.diedAt,
      archivedAt:
        r.archivedAt instanceof Date ? r.archivedAt.toISOString() : String(r.archivedAt),
    })),
  };
}

// No poll — notified by reconcileDeadJobs after each archive/purge.
export const deadJobsResource = defineResource({
  key: "dead-jobs",
  mode: "invalidate",
  schema: DeadJobsPayloadSchema,
  loader: async (): Promise<DeadJobsPayload> => loadDeadJobsList(2000),
});

let pollTimer: ReturnType<typeof setInterval> | undefined;

// `jobs-list` reads the `graphile_worker.*` job tables, which live OUTSIDE the
// public schema the L4 DB change-feed triggers cover (the feed deliberately
// excludes the graphile_worker schema) — so the feed can NEVER invalidate this
// resource. It is therefore an explicit-source resource (`defineExternalResource`,
// the only factory that exposes `notify`): graphile-worker lifecycle transitions
// (pick up, complete, fail) happen inside the runner we can't hook, so we poll
// while observed to keep the debug pane reasonably fresh; explicit mutations
// (retry/cancel/dead-gc) notify immediately. Follow-up: graphile-worker's own
// LISTEN channel could replace the poll, or the feed could be extended to the
// graphile_worker schema.
export const jobsListResource = defineExternalResource({
  key: "jobs-list",
  mode: "invalidate",
  schema: JobsPayloadSchema,
  loader: async (): Promise<JobsPayload> => loadJobsList(500),
  onFirstSubscribe: () => {
    // eslint-disable-next-line detached-work-safety/no-untracked-detached-work -- cheap resource-refresh tick: only calls notify(); the recompute it schedules is separately spanned as a loader
    pollTimer = setInterval(() => {
      jobsListResource.notify();
    }, 3000);
  },
  onLastUnsubscribe: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  },
});
