import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  ALL_JOB_TASKS,
  HOLD_CLASSES,
  holdForTask,
  type HoldClass,
} from "../../core/hold";

// THE single home for the graphile-internals coupling. Every read of the queue —
// dead-job reaping (dead-job-gc.ts) and the read-only introspection API below —
// composes these fragments, so the job task scope, the
// `payload->>'jobName'` encoding, the `_private_jobs`/`_private_tasks` table
// names, and the "terminally dead" predicate can never drift across call sites.

// Every Singularity job is stored under one of this plugin's graphile tasks (one
// per hold class, plus the legacy task); the real job name lives in the payload.
// `(unknown)` guards the (theoretical) row with no jobName.
export const jobNameExpr = sql`coalesce(j.payload->>'jobName', '(unknown)')`;

// The live-queue source: the graphile job table joined to its task table.
export const queueJobsFrom = sql`graphile_worker._private_jobs j
  JOIN graphile_worker._private_tasks t ON t.id = j.task_id`;

// Scope to this plugin's graphile tasks (all job states, not just dead). The
// list is composed from `ALL_JOB_TASKS` rather than named here — a class added
// to the table widens every read in this file for free. `IN (…)` over one bound
// param per task, not `= ANY(…)`: drizzle expands a list into separate params,
// and `ANY` wants a single array value.
export const jobTaskScope = sql`t.identifier IN (${sql.join(
  ALL_JOB_TASKS.map((task) => sql`${task}`),
  sql`, `,
)})`;

// A row's hold class, read off the task it sits on. Built by mapping over the
// class table (via `holdForTask`, which also owns the legacy task's `minutes`
// reading) so it cannot drift from it: nothing below restates a task name or a
// class name. Lives here with `jobLockHeldExpr` because it is graphile coupling
// — `_private_tasks.identifier` is the only place the class is recorded.
//
// The `::text` on each result is not decoration: every branch is a bound param,
// and a CASE whose arms are all untyped params leans on Postgres's
// "all-unknown resolves to text" rule. Saying it outright is cheaper than
// relying on it.
export const jobHoldExpr = sql`CASE ${sql.join(
  ALL_JOB_TASKS.map(
    (task) => sql`WHEN t.identifier = ${task} THEN ${holdForTask(task)}::text`,
  ),
  sql` `,
)} END`;

// "Dead" = our task AND exhausted retries AND not currently locked. Never
// reap/aggregate a row a worker is actively running.
export const deadJobPredicate = sql`${jobTaskScope}
  AND j.attempts >= j.max_attempts
  AND j.locked_at IS NULL`;

// "Ready" = eligible to run right now but not yet picked up: overdue, unlocked,
// and still within its retry budget. The single home for the ready predicate,
// shared by the aggregate backlog snapshot and the per-jobName attribution.
export const readyPredicate = sql`j.run_at <= now() AND j.locked_at IS NULL AND j.attempts < j.max_attempts`;

// "A worker is provably still running this row": a granted, session-scoped
// advisory lock keyed on the graphile job id exists in THIS database. That lock
// is taken by `withJobLock` (job-lock.ts) for exactly the handler's lifetime and
// released by Postgres itself the instant the owning backend goes away — SIGKILL,
// OOM-killer, kernel panic, `process.exit()` alike — because lock release is part
// of backend teardown. So this is a FACT the database maintains, not an estimate
// off a clock: unlike `locked_at` it cannot go stale, and host sleep (which
// freezes every timer we own) cannot forge it.
//
// The key encoding must match `pg_try_advisory_lock(<graphile job id>::bigint)`
// byte for byte: the single-bigint form splits its key across `classid` (high 32
// bits) and `objid` (low 32 bits) and marks it `objsubid = 1` (the two-int form
// uses 2), and advisory locks are database-scoped, so the `datname` guard keeps
// one worktree's fork from reading a sibling fork's locks. That encoding is
// precisely the kind of detail that drifts once it is copied per call site, so
// it lives here with the rest of the graphile coupling and is composed, never
// re-typed. Correlated on `j` like every other fragment in this file.
export const jobLockHeldExpr = sql`EXISTS (
    SELECT 1
      FROM pg_locks l
     WHERE l.locktype = 'advisory'
       AND l.granted
       AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND l.objsubid = 1
       AND ((l.classid::bigint << 32) | l.objid::bigint) = j.id
  )`;

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

// The same depth/stall numbers as {@link QueueBacklogStat}, for ONE hold class.
// A class's ready work can only be drained by the runners whose task list serves
// it (`reachableSlots(hold)`), so "how deep is the queue" is a per-class question
// as well as a global one.
export interface QueueClassBacklogStat {
  hold: HoldClass;
  readyCount: number;
  lockedCount: number;
  oldestOverdueMs: number;
}

// A single aggregate snapshot of the queue's depth/stall state, plus the same
// broken out per hold class. The rollup fields are unchanged and stay the whole
// queue — existing consumers keep parsing — and `classes` always carries one
// entry per class in `HOLD_CLASSES`, zeroed when that class has no rows.
export interface QueueBacklogStat {
  readyCount: number;
  lockedCount: number;
  oldestOverdueMs: number;
  classes: QueueClassBacklogStat[];
}

interface QueueBacklogRow {
  hold: HoldClass;
  ready_count: number;
  locked_count: number;
  // bigint comes back from pg as a string; coerced to number below.
  oldest_overdue_ms: string;
}

// Read-only: queue depth/stall metrics. readyCount = overdue, unlocked,
// retry-eligible; lockedCount = currently running; oldestOverdueMs = age of the
// oldest ready job.
//
// ONE grouped query, summed in TS, rather than a rollup query beside a grouped
// one: the total is then the sum of the parts by construction, and cannot
// disagree with them across two round-trips. `oldestOverdueMs` rolls up as a max
// (the oldest of the per-class oldests IS the global oldest), the counts as sums.
export async function queryQueueBacklog(): Promise<QueueBacklogStat> {
  const result = await db.execute(sql`
    SELECT ${jobHoldExpr}                                          AS hold,
           count(*) FILTER (WHERE ${readyPredicate})::int           AS ready_count,
           count(*) FILTER (WHERE j.locked_at IS NOT NULL)::int     AS locked_count,
           coalesce(
             extract(epoch FROM (
               now() - min(j.run_at) FILTER (WHERE ${readyPredicate})
             )) * 1000,
             0
           )::bigint AS oldest_overdue_ms
      FROM ${queueJobsFrom}
     WHERE ${jobTaskScope}
     GROUP BY 1
  `);

  const byHold = new Map<HoldClass, QueueClassBacklogStat>(
    HOLD_CLASSES.map((hold) => [
      hold,
      { hold, readyCount: 0, lockedCount: 0, oldestOverdueMs: 0 },
    ]),
  );
  for (const r of result.rows as unknown as QueueBacklogRow[]) {
    const entry = byHold.get(r.hold);
    if (!entry) continue;
    entry.readyCount = r.ready_count;
    entry.lockedCount = r.locked_count;
    entry.oldestOverdueMs = Number(r.oldest_overdue_ms);
  }
  const classes = [...byHold.values()];

  return {
    readyCount: classes.reduce((n, c) => n + c.readyCount, 0),
    lockedCount: classes.reduce((n, c) => n + c.lockedCount, 0),
    oldestOverdueMs: classes.reduce(
      (ms, c) => Math.max(ms, c.oldestOverdueMs),
      0,
    ),
    classes,
  };
}

// One ready row per distinct jobName: how many are waiting and how overdue the
// oldest is. GROUP BY jobName over the ready predicate, ordered by depth, top-N.
// Attributes the aggregate backlog rollup to the jobs filling the ready queue.
export interface BacklogJobStat {
  jobName: string;
  /** The class of the task these rows sit on — i.e. which runners can drain
   * them. Grouped alongside the name, so a backlog reads as "this much
   * `instant` work is waiting" rather than just "this much work". One jobName
   * normally yields one row (all its rows share its class's task); mid-deploy
   * it can briefly yield two, when some of its rows are still on the legacy
   * task and the boot re-point has not run yet. Two truthful rows beat one
   * averaged one. */
  hold: HoldClass;
  readyCount: number;
  oldestOverdueMs: number;
}

interface BacklogJobStatRow {
  job_name: string;
  hold: HoldClass;
  ready_count: number;
  // bigint comes back from pg as a string; coerced to number below.
  oldest_overdue_ms: string;
}

// Read-only: ready-queue depth per jobName, top-N by readyCount.
export async function queryBacklogByJobName(
  limit = 5,
): Promise<BacklogJobStat[]> {
  const result = await db.execute(sql`
    SELECT ${jobNameExpr}                                          AS job_name,
           ${jobHoldExpr}                                          AS hold,
           count(*)::int                                           AS ready_count,
           coalesce(
             extract(epoch FROM (now() - min(j.run_at))) * 1000,
             0
           )::bigint                                               AS oldest_overdue_ms
      FROM ${queueJobsFrom}
     WHERE ${jobTaskScope} AND ${readyPredicate}
     GROUP BY 1, 2
     ORDER BY ready_count DESC
     LIMIT ${limit}
  `);
  return (result.rows as unknown as BacklogJobStatRow[]).map((r) => ({
    jobName: r.job_name,
    hold: r.hold,
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
  /** The class of the task this row sits on — which tier of the ladder's slots
   * it is occupying. A `minutes` holder occupies one of the 4 wide slots; an
   * `instant` holder may be sitting in the reserved floor. */
  hold: HoldClass;
  jobId: string;
  lockedForMs: number;
  lockedBy: string | null;
  // Whether a worker is still provably running this row (`jobLockHeldExpr`).
  // Deliberately NOT inferred from `lockedForMs`: duration says nothing about
  // liveness — a six-hour handler is as alive as a 200 ms one. `false` means
  // either the owning backend died (the stuck-lock sweeper reclaims the row on
  // its next tick) or dispatch is still inside the sub-second window between
  // graphile's `get_job` stamping `locked_at` and `withJobLock` taking the lock.
  alive: boolean;
}

interface RunningJobStatRow {
  job_name: string;
  hold: HoldClass;
  job_id: string;
  // bigint comes back from pg as a string; coerced to number below.
  locked_for_ms: string;
  locked_by: string | null;
  alive: boolean;
}

// Read-only: currently-locked (running) jobs, longest-held slot first.
// `locked_at` still answers "for how long" (graphile stamps it exactly once, at
// dispatch); `pg_locks` answers "is it alive". Those are two different questions
// and this is the one place both are read together.
export async function queryRunningJobs(): Promise<RunningJobStat[]> {
  const result = await db.execute(sql`
    SELECT ${jobNameExpr}                                              AS job_name,
           ${jobHoldExpr}                                              AS hold,
           j.id::text                                                  AS job_id,
           (extract(epoch FROM (now() - j.locked_at)) * 1000)::bigint  AS locked_for_ms,
           j.locked_by                                                 AS locked_by,
           ${jobLockHeldExpr}                                          AS alive
      FROM ${queueJobsFrom}
     WHERE ${jobTaskScope} AND j.locked_at IS NOT NULL
     ORDER BY locked_for_ms DESC
  `);
  return (result.rows as unknown as RunningJobStatRow[]).map((r) => ({
    jobName: r.job_name,
    hold: r.hold,
    jobId: r.job_id,
    lockedForMs: Number(r.locked_for_ms),
    lockedBy: r.locked_by,
    alive: r.alive,
  }));
}
