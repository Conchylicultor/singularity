import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { JOB_TASK } from "./constants";
import {
  defineJob,
  UNSAFE_getRegisteredJob,
  type JobTaskPayload,
} from "./registry";
import { RESUME_KEYS, ResumeInputSchema } from "./resume-contract";
import { _jobWaits } from "./tables";
import { getWorkerUtils } from "./worker";

// Builtin — registered once at jobs plugin boot. Targeted by every
// `ctx.waitFor(...)` trigger row and every `ctx.sleep(...)` / timeout
// scheduled job. On invocation: resolve the wait row, re-enqueue the target
// handler with the original input, and (for event-path) cancel the timeout
// racer.
export const jobsResumeJob = defineJob({
  name: "jobs.resume",
  input: ResumeInputSchema,
  // Event payload is whatever event the waiter subscribed to — accept any
  // object so the payload is captured verbatim and stored in
  // `_jobWaits.payloadJson` for the awaiting workflow to read on resume.
  event: z.record(z.unknown()),
  dedup: "none",
  // Bumped — resolving a wait involves two DB writes and a target enqueue;
  // each is idempotent, so safe to retry on transient failure.
  maxAttempts: 5,
  run: async ({ input, event }) => {
    const workflowRunId = input[RESUME_KEYS.workflowRunId];
    const waitName = input[RESUME_KEYS.waitName];
    const targetJobName = input[RESUME_KEYS.jobName];
    const originalInput = input[RESUME_KEYS.input];
    const isTimeout = input[RESUME_KEYS.timeout] === true;

    // The event payload (when present) is what gets stored for the awaiting
    // workflow. Direct timeout enqueues pass `event: undefined`; for
    // event-path resumes the dispatcher delivers the source event verbatim.
    const payloadRecord = (event ?? {}) as Record<string, unknown>;

    const existing = await db
      .select()
      .from(_jobWaits)
      .where(
        and(
          eq(_jobWaits.workflowRunId, workflowRunId),
          eq(_jobWaits.waitName, waitName),
        ),
      )
      .limit(1);
    const row = existing[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!row) {
      // Workflow was cleaned up (completed earlier) — nothing to resume.
      return;
    }
    if (row.status !== "pending") {
      // Raced — the other racer won. Either timeout fired first and event
      // arrives late, or vice versa. Nothing to do.
      return;
    }

    await db
      .update(_jobWaits)
      .set({
        status: isTimeout ? "timed_out" : "resolved",
        payloadJson: isTimeout ? null : (payloadRecord as Record<string, unknown>),
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(_jobWaits.workflowRunId, workflowRunId),
          eq(_jobWaits.waitName, waitName),
        ),
      );

    const target = UNSAFE_getRegisteredJob(targetJobName);
    if (!target) {
      // Schema drift — the job was removed between suspend and resume.
      // Preserve the wait row (status now resolved/timed_out) so an operator
      // can diagnose; return cleanly so the events dispatcher doesn't retry.
      console.warn(
        `[jobs.resume] unknown target job "${targetJobName}" for workflow ${workflowRunId}:${waitName}`,
      );
      return;
    }

    // Re-enqueue the handler with the ORIGINAL input by going straight to
    // graphile's `addJob`, NOT through `target.enqueue`. The public enqueue
    // path runs `spec.input.parse(input)` on every call; re-running that on
    // an already-parsed value would apply the schema's `.transform()` a
    // second time and diverge for non-idempotent transforms. Resume uses
    // the value the handler last received — the worker validates with
    // safeParse before dispatch, so we don't lose drift detection.
    //
    // jobKey = workflowRunId means graphile collapses any stale row with
    // the same workflow key (replace mode).
    const utils = await getWorkerUtils();
    await utils.addJob(
      JOB_TASK,
      {
        jobName: targetJobName,
        workflowRunId,
        input: originalInput,
      } satisfies JobTaskPayload,
      { jobKey: workflowRunId, maxAttempts: target.maxAttempts },
    );

    // Event-path: cancel the scheduled timeout racer. We only know the
    // jobKey, not the id, so SQL it directly. `graphile_worker._private_jobs`
    // stores the jobKey in column `key`.
    if (!isTimeout) {
      const timeoutKey = `jobs.resume.timeout:${workflowRunId}:${waitName}`;
      await db.execute(
        sql`DELETE FROM graphile_worker._private_jobs WHERE key = ${timeoutKey} AND locked_at IS NULL`,
      );
    }
  },
});
