import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { deadJobPredicate, jobNameExpr, queueJobsFrom } from "./introspection";
import { defineJob } from "./registry";
import { jobsListResource } from "./resources";

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
    await tx.execute(sql`
      INSERT INTO dead_jobs (id, job_name, input, attempts, max_attempts, last_error, died_at)
      SELECT j.id::text,
             ${jobNameExpr},
             j.payload->'input',
             j.attempts,
             j.max_attempts,
             j.last_error,
             j.updated_at
        FROM ${queueJobsFrom}
       WHERE ${deadJobPredicate}
      ON CONFLICT (id) DO NOTHING
    `);

    // Purge: delete the archived rows from the queue.
    await tx.execute(sql`
      DELETE FROM graphile_worker._private_jobs j
       USING graphile_worker._private_tasks t
       WHERE t.id = j.task_id
         AND ${deadJobPredicate}
    `);

    // Bound the archive: drop rows past the TTL.
    await tx.execute(sql`
      DELETE FROM dead_jobs
       WHERE archived_at < now() - (${ARCHIVE_TTL})::interval
    `);

    // Bound the archive: keep only the newest ARCHIVE_CAP rows.
    await tx.execute(sql`
      DELETE FROM dead_jobs
       WHERE id IN (
         SELECT id FROM dead_jobs
          ORDER BY archived_at DESC
          OFFSET ${ARCHIVE_CAP}
       )
    `);
  });

  // dead_jobs is public (the change-feed invalidates deadJobsResource on the
  // insert/delete above), but the purge from graphile_worker._private_jobs is
  // outside the feed → notify jobs-list explicitly.
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
