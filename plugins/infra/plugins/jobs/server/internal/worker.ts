import { eq } from "drizzle-orm";
import {
  makeWorkerUtils,
  run,
  type Runner,
  type WorkerUtils,
} from "graphile-worker";
import { connectionString, db } from "@server/db/client";
import { JOB_TASK } from "./constants";
import {
  UNSAFE_getRegisteredJob,
  type JobTaskPayload,
} from "./registry";
import { isSuspendSignal, makeDurableCtx } from "./step-ctx";
import { _jobSteps, _jobWaits } from "./tables";

const CONCURRENCY = 4;

let runner: Runner | null = null;

// Lazy singleton. The first `enqueue()` call (which may land before
// `startWorker()` in the onReady cycle) initializes this; `makeWorkerUtils`
// runs Graphile's own migrations, which are idempotent and safe to race with
// the runner's init.
let workerUtilsPromise: Promise<WorkerUtils> | null = null;

export function getWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({ connectionString });
  }
  return workerUtilsPromise;
}

export async function startWorker(): Promise<Runner> {
  if (runner) return runner;
  runner = await run(
    {
      connectionString,
      concurrency: CONCURRENCY,
      taskList: {
        // biome-ignore lint/suspicious/noExplicitAny: graphile's JobHelpers typing requires the full interface; we only need job.id and job.attempts.
        [JOB_TASK]: async (payload: unknown, helpers: any) => {
          const p = payload as JobTaskPayload;
          await dispatch(p, {
            jobId: String(helpers.job.id),
            attempt: Number(helpers.job.attempts),
          });
        },
      },
    },
    // Pass parsedCronItems=[] so Graphile skips crontab-file discovery (we
    // don't use file-based cron; a future plugin may contribute one on top).
    undefined,
    [],
  );
  return runner;
}

export async function stopWorker(): Promise<void> {
  if (runner) {
    await runner.stop();
    runner = null;
  }
  if (workerUtilsPromise) {
    const utils = await workerUtilsPromise;
    await utils.release();
    workerUtilsPromise = null;
  }
}

// Layer 1 failure policy: fail-loud. Unknown job or schema drift → throw;
// Graphile retries up to `maxAttempts`, then permanently-fails (row stays
// in `graphile_worker.jobs` with `attempts >= max_attempts`). Layer 1 has
// nothing to preserve — callers (like the events dispatcher) that want
// preservation semantics catch those conditions in their own handler.
async function dispatch(
  payload: JobTaskPayload,
  meta: { jobId: string; attempt: number },
): Promise<void> {
  const job = UNSAFE_getRegisteredJob(payload.jobName);
  if (!job) {
    throw new Error(`[jobs] unknown job "${payload.jobName}"`);
  }
  // Validation only — DO NOT use `parsed.data` for the handler. The stored
  // payload was already transformed at enqueue time; re-using `parsed.data`
  // would re-run any `.transform()` in the schema on every retry/resume,
  // which yields divergent results for non-idempotent transforms (e.g.
  // `z.string().transform(s => s + "!")`). Contract: a job's input schema
  // is parsed exactly once, at the original `enqueue()`. The worker
  // re-validates only to catch schema drift after a redeploy.
  const validation = job.inputSchema.safeParse(payload.input);
  if (!validation.success) {
    throw new Error(
      `[jobs] input schema drift for "${payload.jobName}": ${validation.error.message}`,
    );
  }

  const workflowRunId =
    payload.workflowRunId ??
    // Back-compat for any pre-workflowRunId rows that may still sit in the
    // queue during a rolling upgrade: synthesise a stable id from jobId so
    // the step log keys are consistent across retries of THIS graphile job.
    `legacy:${meta.jobId}`;

  const ctx = makeDurableCtx({
    jobId: meta.jobId,
    attempt: meta.attempt,
    workflowRunId,
    jobName: payload.jobName,
    originalInput: payload.input,
    scheduleResume: async (resumePayload, opts) => {
      const resumeJob = UNSAFE_getRegisteredJob("jobs.resume");
      if (!resumeJob) {
        throw new Error(
          "[jobs] jobs.resume not registered — jobs/server/index.ts must side-effect import resume-job.ts",
        );
      }
      // Bypass `defineJob.enqueue`'s per-job-name namespacing: the timeout
      // `jobKey` is a fully-formed identity owned by this scheduler, and
      // the cancel-DELETE in `resume-job.ts` matches on the bare form.
      // Going through `resumeJob.enqueue` would prefix it with
      // `jobs.resume:` and the DELETE would miss. The worker re-parses
      // `input` against `inputSchema` on dispatch, so we don't lose
      // schema-drift detection by skipping the public parse.
      const utils = await getWorkerUtils();
      await utils.addJob(
        JOB_TASK,
        {
          jobName: "jobs.resume",
          workflowRunId: opts.jobKey,
          input: resumePayload,
        } satisfies JobTaskPayload,
        {
          jobKey: opts.jobKey,
          runAt: opts.runAt,
          maxAttempts: resumeJob.maxAttempts,
        },
      );
    },
  });

  try {
    // Layer-1 has no event source — direct enqueues always see event=undefined.
    // Event-triggered invocations go through the events dispatcher, which
    // calls target.run({ input, event, ctx }) directly with both fields.
    await job.run({ input: payload.input, event: undefined, ctx });
  } catch (err) {
    if (isSuspendSignal(err)) {
      // Graphile sees a successful run — the current job completes and the
      // row is deleted. Resume happens via a fresh `enqueue` issued by
      // `jobs.resume` when the event fires or the timeout hits.
      return;
    }
    throw err;
  }

  // Normal completion: drop the step + wait logs for this run. Trigger rows
  // outlive this cleanup — oneShot rows are deleted by the events dispatcher
  // after their target succeeds; an orphan from a never-fired trigger is
  // harmless (it fires → `jobs.resume` finds no wait row → returns).
  //
  // Cleanup failures are logged but NOT thrown. The handler already
  // succeeded; rethrowing would force graphile to retry an idempotent
  // workflow whose only effect is dead-row cleanup. The leaked rows are
  // bounded (one workflow's worth) and harmless on replay — the next
  // dispatch of the same workflowRunId would short-circuit through the
  // cached steps. A periodic sweep can reap them later if it ever matters.
  try {
    await db
      .delete(_jobSteps)
      .where(eq(_jobSteps.workflowRunId, workflowRunId));
    await db
      .delete(_jobWaits)
      .where(eq(_jobWaits.workflowRunId, workflowRunId));
  } catch (err) {
    console.warn(
      `[jobs] cleanup of step/wait logs failed for workflow ${workflowRunId}`,
      err,
    );
  }
}
