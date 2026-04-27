import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/db/client";
import { JOB_TASK } from "./constants";
import {
  defineJob,
  UNSAFE_getRegisteredJob,
  type JobTaskPayload,
} from "./registry";
import { RESUME_KEYS } from "./step-ctx";
import { _jobWaits } from "./tables";
import { getWorkerUtils } from "./worker";

// Reserved-keys schema: every `__resume_*` field must survive `.parse`, and
// any other keys (the event payload) pass through as extra properties. We
// consume passthrough via `.passthrough()` so the events dispatcher can hand
// us `jobWith ∪ eventPayload` without schema drift.
const ResumeInputSchema = z
  .object({
    [RESUME_KEYS.workflowRunId]: z.string(),
    [RESUME_KEYS.waitName]: z.string(),
    [RESUME_KEYS.jobName]: z.string(),
    [RESUME_KEYS.input]: z.unknown(),
    [RESUME_KEYS.timeout]: z.boolean().optional(),
  })
  .passthrough();

// Builtin — registered once at jobs plugin boot. Targeted by every
// `ctx.waitFor(...)` trigger row and every `ctx.sleep(...)` / timeout
// scheduled job. On invocation: resolve the wait row, re-enqueue the target
// handler with the original input, and (for event-path) cancel the timeout
// racer.
export const jobsResumeJob = defineJob({
  name: "jobs.resume",
  input: ResumeInputSchema,
  // Bumped — resolving a wait involves two DB writes and a target enqueue;
  // each is idempotent, so safe to retry on transient failure.
  maxAttempts: 5,
  run: async (p) => {
    const workflowRunId = p[RESUME_KEYS.workflowRunId] as string;
    const waitName = p[RESUME_KEYS.waitName] as string;
    const targetJobName = p[RESUME_KEYS.jobName] as string;
    const originalInput = p[RESUME_KEYS.input];
    const isTimeout = (p[RESUME_KEYS.timeout] as boolean | undefined) === true;

    // Drop the reserved keys; everything left came from the event payload
    // (the events dispatcher merges `jobWith ∪ eventPayload`, with event
    // fields winning on collision).
    const payloadRecord = { ...(p as Record<string, unknown>) };
    for (const k of Object.values(RESUME_KEYS)) delete payloadRecord[k];

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
