import { eq } from "drizzle-orm";
import {
  makeWorkerUtils,
  parseCronItem,
  run,
  type ParsedCronItem,
  type Runner,
  type WorkerUtils,
} from "graphile-worker";
import { db } from "@plugins/database/server";
import { connectionString } from "@plugins/database/plugins/admin/server";
import { isMain } from "@plugins/infra/plugins/paths/core";
import { reportServerError } from "@plugins/framework/plugins/server-core/core";
import {
  recordEntrySpan,
  runInBackgroundLane,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { JOB_TASK, JOB_CONCURRENCY } from "./constants";
import {
  getScheduledJobs,
  UNSAFE_getRegisteredJob,
  type JobTaskPayload,
} from "./registry";
import { isSuspendSignal, makeDurableCtx } from "./step-ctx";
import { isNonRetryableError } from "./non-retryable";
import { markJobPermanentlyFailed } from "./introspection";
import { _jobSteps, _jobWaits } from "./tables";

let runner: Runner | null = null;

// Lazy singleton. The first `enqueue()` call (which may land before
// `startWorker()` in the onReady cycle) initializes this; `makeWorkerUtils`
// runs Graphile's own migrations, which are idempotent and safe to race with
// the runner's init.
let workerUtilsPromise: Promise<WorkerUtils> | null = null;

export function getWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({ connectionString: connectionString() });
  }
  return workerUtilsPromise;
}

// Live, mutable cron-item array handed to graphile-worker's run(). Graphile
// re-reads this reference on every tick (its docs declare it mutable), so we
// hand it over empty at worker start and populate it later in
// `installScheduledCronItems()` — once every plugin is ready, since a schedule
// resolver may read another plugin's config (populated in its onReady).
const scheduledCronItems: ParsedCronItem[] = [];

// (Re)build cron items from the registry into the live array. Call once after
// the onAllReady barrier; safe to call again to refresh.
export function installScheduledCronItems(): void {
  scheduledCronItems.splice(0, scheduledCronItems.length, ...buildCronItems());
}

// Build graphile-worker cron items from every job that declared a `schedule`.
// Resolver-form schedules are evaluated here so a job can derive its crontab
// from config or disable itself by returning null. All scheduled jobs route
// through the single JOB_TASK; the per-tick payload carries the job name and
// its default input, and graphile injects `_cron`.
function buildCronItems(): ParsedCronItem[] {
  const items: ParsedCronItem[] = [];
  const main = isMain();
  for (const job of getScheduledJobs()) {
    const { schedule } = job;
    if (!schedule) continue;
    // graphile's known_crontabs dedup is per-database, and every worktree
    // backend runs its own worker against its own DB — so a schedule left to
    // run everywhere fires once per live worktree. Default to main-only;
    // perWorktree jobs opt back in to running in every worktree.
    if (!main && !schedule.perWorktree) continue;
    const cron =
      typeof schedule.cron === "function" ? schedule.cron() : schedule.cron;
    if (!cron || !cron.trim()) continue;
    // Scheduled jobs take no caller input; the tick payload is the schema's
    // default shape. Fail loud at startup if the input isn't defaultable.
    const input = job.inputSchema.parse({});
    items.push(
      parseCronItem({
        task: JOB_TASK,
        match: cron.trim(),
        identifier: `cron:${job.name}`,
        payload: { jobName: job.name, input } satisfies JobTaskPayload,
        // backfillPeriod 0 ⇒ no catch-up flood on boot.
        options: { backfillPeriod: 0, maxAttempts: job.maxAttempts },
      }),
    );
  }
  return items;
}

export async function startWorker(): Promise<Runner> {
  if (runner) return runner;
  runner = await run(
    {
      connectionString: connectionString(),
      concurrency: JOB_CONCURRENCY,
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
    // Hand graphile the live (initially empty) cron-item array; it re-reads
    // this reference each tick. Items are installed after the onAllReady
    // barrier via installScheduledCronItems(). Passing an explicit array also
    // skips graphile's crontab-file discovery.
    undefined,
    scheduledCronItems,
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

// Layer 1 failure policy: fail-loud. Unknown job or input-schema drift → throw;
// Graphile retries up to `maxAttempts`, then permanently-fails (row stays in
// `graphile_worker._private_jobs` with `attempts >= max_attempts`). A handler
// that knows its failure is DETERMINISTIC can throw a `NonRetryableError`
// instead: the catch below collapses the retry budget so the row dead-letters
// after a single attempt — loud, reported, and visible, but without burning
// `maxAttempts` retries of pure waste. Layer 1 itself has nothing to preserve —
// callers (like the events dispatcher) that want preservation semantics catch
// those conditions in their own handler.
async function dispatch(
  payload: JobTaskPayload,
  meta: { jobId: string; attempt: number },
): Promise<void> {
  const job = UNSAFE_getRegisteredJob(payload.jobName);
  if (!job) {
    const err = new Error(`[jobs] unknown job "${payload.jobName}"`);
    reportServerError({ message: err.message, stack: err.stack ?? null });
    throw err;
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
    const err = new Error(
      `[jobs] input schema drift for "${payload.jobName}": ${validation.error.message}`,
    );
    reportServerError({ message: err.message, stack: err.stack ?? null });
    throw err;
  }

  // Direct enqueues bake in `workflowRunId`. Cron ticks don't — graphile
  // injects `_cron.ts` (the per-minute UTC tick), so derive a stable per-tick
  // id from it. The `legacy:` fallback covers any pre-workflowRunId rows still
  // queued during a rolling upgrade.
  const workflowRunId =
    payload.workflowRunId ??
    (payload._cron
      ? `${payload.jobName}:${payload._cron.ts}`
      : `legacy:${meta.jobId}`);

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
    await recordEntrySpan("job", payload.jobName, () =>
      job.run({ input: payload.input, event: payload.event, ctx }),
    );
  } catch (err) {
    if (isSuspendSignal(err)) {
      // Graphile sees a successful run — the current job completes and the
      // row is deleted. Resume happens via a fresh `enqueue` issued by
      // `jobs.resume` when the event fires or the timeout hits.
      return;
    }
    const errObj = err instanceof Error ? err : new Error(String(err));
    reportServerError({
      message: `[jobs] ${payload.jobName} failed (attempt ${meta.attempt}): ${errObj.message}`,
      stack: errObj.stack ?? null,
      errorType: errObj.name,
    });
    // A NonRetryableError signals a DETERMINISTIC failure — the same stored
    // input will fail identically on every retry. Collapse the retry budget so
    // graphile dead-letters this row after the current attempt instead of
    // churning `maxAttempts` retries of pure waste. The throw below still feeds
    // graphile's fail handler (sets last_error, clears the lock); the row then
    // satisfies `deadJobPredicate` and queue-health reaps it as one dead-letter.
    // If the budget-collapse write itself fails, we fall through to the throw
    // and graphile retries normally (the real cause was already reported above).
    //
    // The `job` entry span above wraps only `job.run()`, so this write lands with
    // no ambient entry and would be classified context-less — hence ungated,
    // running against the connections reserved for human-blocking work. Widening
    // the span would corrupt the recorded job duration; declaring the lane is the
    // right tool. See research/2026-07-09-global-interactive-lane-origin-based-db-gating.md.
    if (isNonRetryableError(err)) {
      await runInBackgroundLane(() => markJobPermanentlyFailed(meta.jobId));
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
  //
  // Outside the `job` entry span (it wraps only `job.run()`), so without the
  // explicit declaration these deletes are context-less and therefore ungated,
  // taking connections reserved for interactive work to clean up after background
  // work. Both awaits stay inside the lane scope so their pool connections are
  // acquired under the declaration. See
  // research/2026-07-09-global-interactive-lane-origin-based-db-gating.md.
  try {
    await runInBackgroundLane(async () => {
      await db
        .delete(_jobSteps)
        .where(eq(_jobSteps.workflowRunId, workflowRunId));
      await db
        .delete(_jobWaits)
        .where(eq(_jobWaits.workflowRunId, workflowRunId));
    });
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.warn(
      `[jobs] cleanup of step/wait logs failed for workflow ${workflowRunId}`,
      err,
    );
  }
}
