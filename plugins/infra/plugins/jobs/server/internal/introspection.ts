import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { JOB_TASK } from "./constants";

// THE single home for the graphile-internals coupling. Every read of the queue —
// dead-job reaping (dead-job-gc.ts) and the read-only introspection API below —
// composes these fragments, so the `jobs.run` task scope, the
// `payload->>'jobName'` encoding, the `_private_jobs`/`_private_tasks` table
// names, and the "terminally dead" predicate can never drift across call sites.

// Every Singularity job is stored under the single `jobs.run` graphile task; the
// real job name lives in the payload. `(unknown)` guards the (theoretical) row
// with no jobName.
export const jobNameExpr = sql`coalesce(j.payload->>'jobName', '(unknown)')`;

// The live-queue source: the graphile job table joined to its task table.
export const queueJobsFrom = sql`graphile_worker._private_jobs j
  JOIN graphile_worker._private_tasks t ON t.id = j.task_id`;

// Scope to this plugin's graphile task (all job states, not just dead).
export const jobTaskScope = sql`t.identifier = ${JOB_TASK}`;

// "Dead" = our task AND exhausted retries AND not currently locked. Never
// reap/aggregate a row a worker is actively running.
export const deadJobPredicate = sql`${jobTaskScope}
  AND j.attempts >= j.max_attempts
  AND j.locked_at IS NULL`;

// "Ready" = eligible to run right now but not yet picked up: overdue, unlocked,
// and still within its retry budget. The single home for the ready predicate,
// shared by the aggregate backlog snapshot and the per-jobName attribution.
export const readyPredicate = sql`j.run_at <= now() AND j.locked_at IS NULL AND j.attempts < j.max_attempts`;

// One terminally-dead row per distinct jobName: how many, the worst-case attempt
// counters, the latest error, and a sample graphile job id for hand-inspection.
export interface DeadJobStat {
  jobName: string;
  deadCount: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  sampleJobId: string | null;
}

interface DeadJobStatRow {
  job_name: string;
  dead_count: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  sample_job_id: string | null;
}

// Read-only: terminally-dead jobs in the live queue, grouped by jobName.
export async function queryDeadJobStats(): Promise<DeadJobStat[]> {
  const result = await db.execute(sql`
    SELECT ${jobNameExpr}                                          AS job_name,
           count(*)::int                                           AS dead_count,
           max(j.attempts)::int                                    AS attempts,
           max(j.max_attempts)::int                                AS max_attempts,
           (array_agg(j.last_error ORDER BY j.updated_at DESC))[1] AS last_error,
           (array_agg(j.id::text ORDER BY j.updated_at DESC))[1]   AS sample_job_id
      FROM ${queueJobsFrom}
     WHERE ${deadJobPredicate}
     GROUP BY 1
  `);
  return (result.rows as unknown as DeadJobStatRow[]).map((r) => ({
    jobName: r.job_name,
    deadCount: r.dead_count,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    lastError: r.last_error,
    sampleJobId: r.sample_job_id,
  }));
}

// Collapse a job's retry budget to the attempts already spent, so the next
// graphile `get_job` scan skips it (`attempts < max_attempts` is now false) and
// it falls straight into the terminally-dead set above — `deadJobPredicate`
// holds the instant graphile's fail handler clears the lock. This is the
// supported way to dead-letter a DETERMINISTIC failure after a single attempt
// instead of burning the full retry budget on a payload that will never parse.
// Lives here, beside `deadJobPredicate`, because it exists precisely to satisfy
// it. Targeted single-row write by id — no task join needed.
export async function markJobPermanentlyFailed(jobId: string): Promise<void> {
  await db.execute(sql`
    UPDATE graphile_worker._private_jobs
       SET max_attempts = attempts
     WHERE id = ${jobId}::bigint
  `);
}

// A single aggregate snapshot of the queue's depth/stall state.
export interface QueueBacklogStat {
  readyCount: number;
  lockedCount: number;
  oldestOverdueMs: number;
}

interface QueueBacklogRow {
  ready_count: number;
  locked_count: number;
  // bigint comes back from pg as a string; coerced to number below.
  oldest_overdue_ms: string;
}

// Read-only: queue depth/stall metrics. readyCount = overdue, unlocked,
// retry-eligible; lockedCount = currently running; oldestOverdueMs = age of the
// oldest ready job.
export async function queryQueueBacklog(): Promise<QueueBacklogStat> {
  const result = await db.execute(sql`
    SELECT count(*) FILTER (WHERE ${readyPredicate})::int AS ready_count,
           count(*) FILTER (WHERE j.locked_at IS NOT NULL)::int AS locked_count,
           coalesce(
             extract(epoch FROM (
               now() - min(j.run_at) FILTER (WHERE ${readyPredicate})
             )) * 1000,
             0
           )::bigint AS oldest_overdue_ms
      FROM ${queueJobsFrom}
     WHERE ${jobTaskScope}
  `);
  const row = (result.rows as unknown as QueueBacklogRow[])[0];
  return {
    readyCount: row?.ready_count ?? 0,
    lockedCount: row?.locked_count ?? 0,
    oldestOverdueMs: Number(row?.oldest_overdue_ms ?? 0),
  };
}

// One ready row per distinct jobName: how many are waiting and how overdue the
// oldest is. GROUP BY jobName over the ready predicate, ordered by depth, top-N.
// Attributes the aggregate backlog rollup to the jobs filling the ready queue.
export interface BacklogJobStat {
  jobName: string;
  readyCount: number;
  oldestOverdueMs: number;
}

interface BacklogJobStatRow {
  job_name: string;
  ready_count: number;
  // bigint comes back from pg as a string; coerced to number below.
  oldest_overdue_ms: string;
}

// Read-only: ready-queue depth per jobName, top-N by readyCount.
export async function queryBacklogByJobName(limit = 5): Promise<BacklogJobStat[]> {
  const result = await db.execute(sql`
    SELECT ${jobNameExpr}                                          AS job_name,
           count(*)::int                                           AS ready_count,
           coalesce(
             extract(epoch FROM (now() - min(j.run_at))) * 1000,
             0
           )::bigint                                               AS oldest_overdue_ms
      FROM ${queueJobsFrom}
     WHERE ${jobTaskScope} AND ${readyPredicate}
     GROUP BY 1
     ORDER BY ready_count DESC
     LIMIT ${limit}
  `);
  return (result.rows as unknown as BacklogJobStatRow[]).map((r) => ({
    jobName: r.job_name,
    readyCount: r.ready_count,
    oldestOverdueMs: Number(r.oldest_overdue_ms),
  }));
}

// One currently-locked (running) row, holding a slot from the shared pool: which
// job, its graphile id, how long it has held the slot, and the worker that owns
// it. Ordered by locked duration so the longest slot-holders lead. Attributes
// slot saturation — a job locked for many minutes is why new work waits.
export interface RunningJobStat {
  jobName: string;
  jobId: string;
  lockedForMs: number;
  lockedBy: string | null;
}

interface RunningJobStatRow {
  job_name: string;
  job_id: string;
  // bigint comes back from pg as a string; coerced to number below.
  locked_for_ms: string;
  locked_by: string | null;
}

// Read-only: currently-locked (running) jobs, longest-held slot first.
export async function queryRunningJobs(): Promise<RunningJobStat[]> {
  const result = await db.execute(sql`
    SELECT ${jobNameExpr}                                              AS job_name,
           j.id::text                                                  AS job_id,
           (extract(epoch FROM (now() - j.locked_at)) * 1000)::bigint  AS locked_for_ms,
           j.locked_by                                                 AS locked_by
      FROM ${queueJobsFrom}
     WHERE ${jobTaskScope} AND j.locked_at IS NOT NULL
     ORDER BY locked_for_ms DESC
  `);
  return (result.rows as unknown as RunningJobStatRow[]).map((r) => ({
    jobName: r.job_name,
    jobId: r.job_id,
    lockedForMs: Number(r.locked_for_ms),
    lockedBy: r.locked_by,
  }));
}
