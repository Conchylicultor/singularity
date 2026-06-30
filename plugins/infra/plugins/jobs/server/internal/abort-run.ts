import { and, eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _jobWaits } from "./tables";

/**
 * Tears down a durable run's outstanding suspension state. Best-effort and
 * idempotent — safe to call on an already-finished run or one that never
 * suspended. The jobs plugin owns `_jobWaits` and the resume jobKey conventions,
 * so this teardown lives here (callers stay boundary-clean by passing only the
 * opaque `workflowRunId`).
 *
 * 1. Mark any pending wait rows `cancelled` — so a late `jobs.resume` no-ops
 *    (resume-job.ts bails when the wait row is non-pending).
 * 2. Delete the not-yet-started timeout / sleep racer jobs for this run.
 * 3. Delete a not-yet-started resume of the main handler (jobKey === run).
 *
 * Only unlocked (`locked_at IS NULL`) graphile rows are deleted, so an
 * in-flight resume is left to finish; the cancelled wait row makes it no-op.
 */
export async function abortDurableRun(workflowRunId: string): Promise<void> {
  await db
    .update(_jobWaits)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(
      and(
        eq(_jobWaits.workflowRunId, workflowRunId),
        eq(_jobWaits.status, "pending"),
      ),
    );

  // Cancel the scheduled timeout / sleep racers. We only know the jobKey
  // prefix, not the id, so SQL it directly. `graphile_worker._private_jobs`
  // stores the jobKey in column `key`. Mirror resume-job.ts's DELETE.
  const timeoutPrefix = `jobs.resume.timeout:${workflowRunId}:%`;
  const sleepPrefix = `jobs.resume.sleep:${workflowRunId}:%`;
  await db.execute(
    sql`DELETE FROM graphile_worker._private_jobs WHERE key LIKE ${timeoutPrefix} AND locked_at IS NULL`,
  );
  await db.execute(
    sql`DELETE FROM graphile_worker._private_jobs WHERE key LIKE ${sleepPrefix} AND locked_at IS NULL`,
  );

  // Clear a not-yet-started resume of the main handler (jobKey === run).
  await db.execute(
    sql`DELETE FROM graphile_worker._private_jobs WHERE key = ${workflowRunId} AND locked_at IS NULL`,
  );
}
