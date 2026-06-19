import { sql as drizzleSql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { JOB_TASK } from "./constants";
import { defineJob } from "./registry";
import { deadJobsResource, jobsListResource } from "./resources";

// Bound on the durable archive so it can't itself accumulate unbounded.
// Every reconcile enforces BOTH: rows older than the TTL are dropped, and the
// archive is trimmed to the newest N rows.
const ARCHIVE_TTL = "30 days";
const ARCHIVE_CAP = 2000;

// Archive-then-purge permanently-failed graphile jobs. graphile-worker never
// GCs jobs that exhausted `max_attempts`, so they sit in `_private_jobs`
// forever (one backlog per worktree DB fork). We copy each dead row into the
// durable `dead_jobs` table (idempotent via PK ON CONFLICT), delete it from the
// queue, then bound the archive by TTL + cap. Mirrors the raw-SQL style of
// `sweepOnce` in stuck-lock-sweeper.ts.
//
// "dead" = exhausted retries AND not currently locked (`attempts >= max_attempts
// AND locked_at IS NULL`) — never reap a row a worker is actively running.
export async function reconcileDeadJobs(): Promise<void> {
  await db.transaction(async (tx) => {
    // Archive: insert dead queue rows into dead_jobs. ON CONFLICT DO NOTHING
    // keeps this safe to run on every boot / re-fork.
    await tx.execute(drizzleSql.raw(`
      INSERT INTO dead_jobs (id, job_name, input, attempts, max_attempts, last_error, died_at)
      SELECT j.id::text,
             coalesce(j.payload->>'jobName', '(unknown)'),
             j.payload->'input',
             j.attempts,
             j.max_attempts,
             j.last_error,
             j.updated_at
        FROM graphile_worker._private_jobs j
        JOIN graphile_worker._private_tasks t ON t.id = j.task_id
       WHERE t.identifier = '${JOB_TASK}'
         AND j.attempts >= j.max_attempts
         AND j.locked_at IS NULL
      ON CONFLICT (id) DO NOTHING
    `));

    // Purge: delete the archived rows from the queue.
    await tx.execute(drizzleSql.raw(`
      DELETE FROM graphile_worker._private_jobs j
       USING graphile_worker._private_tasks t
       WHERE t.id = j.task_id
         AND t.identifier = '${JOB_TASK}'
         AND j.attempts >= j.max_attempts
         AND j.locked_at IS NULL
    `));

    // Bound the archive: drop rows past the TTL.
    await tx.execute(drizzleSql.raw(`
      DELETE FROM dead_jobs
       WHERE archived_at < now() - interval '${ARCHIVE_TTL}'
    `));

    // Bound the archive: keep only the newest ARCHIVE_CAP rows.
    await tx.execute(drizzleSql.raw(`
      DELETE FROM dead_jobs
       WHERE id IN (
         SELECT id FROM dead_jobs
          ORDER BY archived_at DESC
          OFFSET ${ARCHIVE_CAP}
       )
    `));
  });

  deadJobsResource.notify();
  jobsListResource.notify();
}

// Scheduled dead-job GC. `perWorktree: true` is REQUIRED here and is the inverse
// of the usual main-only default: each worktree runs its own backend against its
// own DB fork, which has its own `graphile_worker` tables, so dead rows
// accumulate per-DB and must be reaped per-DB. This is NOT recovery infra (it
// doesn't fix a wedged worker — unlike stuck-lock-sweeper, which therefore stays
// a setInterval), so routing it through graphile's own scheduled queue is correct
// and satisfies the no-polling rule.
export const deadJobGcJob = defineJob({
  name: "jobs.dead-gc",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 * * * *", perWorktree: true },
  run: () => reconcileDeadJobs(),
});
