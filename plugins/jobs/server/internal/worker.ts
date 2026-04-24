import {
  makeWorkerUtils,
  run,
  type Runner,
  type WorkerUtils,
} from "graphile-worker";
import { connectionString } from "@server/db/client";
import { JOB_TASK } from "./constants";
import { UNSAFE_getRegisteredJob } from "./registry";

const CONCURRENCY = 4;

interface JobTaskPayload {
  jobName: string;
  input: unknown;
}

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
  ctx: { jobId: string; attempt: number },
): Promise<void> {
  const job = UNSAFE_getRegisteredJob(payload.jobName);
  if (!job) {
    throw new Error(`[jobs] unknown job "${payload.jobName}"`);
  }
  const parsed = job.inputSchema.safeParse(payload.input);
  if (!parsed.success) {
    throw new Error(
      `[jobs] input schema drift for "${payload.jobName}": ${parsed.error.message}`,
    );
  }
  await job.run(parsed.data, ctx);
}
