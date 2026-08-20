import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  connectionString,
  ExcludeSchemaFromFork,
} from "@plugins/database/plugins/admin/server";
import {
  handleCancelJob,
  handleListDeadJobs,
  handleListJobs,
  handleRetryJob,
} from "./internal/handle";
import { deadJobGcJob, reconcileDeadJobs } from "./internal/dead-job-gc";
import { deadJobsResource, jobsListResource } from "./internal/resources";
import { jobsResumeJob } from "./internal/resume-job";
import { installQueueSchema } from "./internal/queue-schema";
import {
  startStuckLockSweeper,
  stopStuckLockSweeper,
} from "./internal/stuck-lock-sweeper";
import {
  installScheduledCronItems,
  startWorkers,
  stopWorkers,
} from "./internal/worker";
import { listJobs, listDeadJobs, retryJob, cancelJob } from "../core/endpoints";

export {
  defineJob,
  UNSAFE_getRegisteredJob,
  getAllRegisteredJobNames,
  DEFAULT_MAX_ATTEMPTS,
  getJobSlowThresholdMs,
  getJobHold,
} from "./internal/registry";
export {
  installQueueSchema,
  QueueSchemaMissingError,
} from "./internal/queue-schema";
export { sweepOnce as UNSAFE_sweepStuckLocks } from "./internal/stuck-lock-sweeper";
export type {
  DefineJobSpec,
  EnqueueOpts,
  EnqueueTx,
  JobCtx,
  JobFactory,
  RegisteredJob,
  ScheduleSpec,
  SerialSpec,
} from "./internal/registry";
export {
  isSuspendSignal,
  UNSAFE_installDurableHooks,
} from "./internal/step-ctx";
export type { DurableHooks } from "./internal/step-ctx";
export { NonRetryableError } from "./internal/non-retryable";
export {
  JobDeadlineExceededError,
  isJobDeadlineExceededError,
} from "./internal/deadline";
export { jobDeadlineSink } from "./internal/deadline-seam";
export type { JobDeadlineEvent } from "./internal/deadline-seam";
// The floor's report kind + payload. Exported because the SPELLING must be
// shared: this plugin writes the durable line (synchronously, on the way out of
// a deliberate exit) and the `deadline-audit` sub-plugin registers the kind that
// interprets it. Two hand-typed copies of a kind string would resolve to
// nothing on the next boot's flush, and the failure would be a log line on a
// backend that had already restarted.
export {
  JOB_SLOT_FLOOR_KIND,
  getForfeitedSlots,
  usableSlots,
} from "./internal/forfeit";
export type { ForfeitedSlot, JobSlotFloorReport } from "./internal/forfeit";
export { abortDurableRun } from "./internal/abort-run";
export { jobsListResource, deadJobsResource } from "./internal/resources";
export {
  queryDeadJobStats,
  queryQueueBacklog,
  queryBacklogByJobName,
  queryRunningJobs,
} from "./internal/introspection";
export type {
  DeadJobStat,
  QueueBacklogStat,
  QueueClassBacklogStat,
  BacklogJobStat,
  RunningJobStat,
} from "./internal/introspection";
export {
  HOLD_CLASSES,
  HoldClassSchema,
  HOLD_SPECS,
  RUNNERS,
  TOTAL_JOB_SLOTS,
  ALL_JOB_TASKS,
  LEGACY_JOB_TASK,
  taskFor,
  priorityFor,
  ceilingMsFor,
  deadlineMsFor,
  reachableSlots,
  holdForTask,
} from "../core/hold";
export type { HoldClass, HoldClassSpec, RunnerSpec } from "../core/hold";

export default {
  description:
    "Durable background jobs primitive built on graphile-worker. Plugins declare jobs via defineJob and enqueue via job.enqueue.",
  loadBearing: true,
  httpRoutes: {
    [listJobs.route]: handleListJobs,
    [listDeadJobs.route]: handleListDeadJobs,
    [retryJob.route]: handleRetryJob,
    [cancelJob.route]: handleCancelJob,
  },
  register: [jobsResumeJob, deadJobGcJob],
  contributions: [
    Resource.Declare(jobsListResource),
    Resource.Declare(deadJobsResource),
    // Graphile's own bookkeeping — queued jobs, worker locks, and the crontab's
    // last-execution watermarks. Inheriting it is actively wrong for a fresh
    // worktree: it would adopt main's pending jobs and, worse, main's
    // `known_crontabs.last_execution`, silently skipping the first run of every
    // scheduled job.
    //
    // Who puts it back: `onReadyBlocking` below, which runs
    // `installQueueSchema()` against this backend's own database before any
    // plugin's `onReady`. It is NOT "the first worker start" any more — that
    // read the invariant off a side effect of `makeWorkerUtils`, so a database
    // whose backend had never booted (a fresh worktree where `./singularity
    // test` runs before `./singularity build`) had no queue schema and no way
    // to acquire one, and a transactional enqueue on it failed with a bare
    // `3F000`. Dropping the schema costs nothing only because something owns
    // reinstalling it; see `internal/queue-schema.ts`.
    //
    // The fork used to copy this schema and then `DROP SCHEMA ... CASCADE` it
    // afterwards. Excluding it at dump time reaches the same end state without
    // the copy.
    ExcludeSchemaFromFork({
      schema: "graphile_worker",
      // The whole schema, not just its rows: the installer re-runs graphile's
      // own migrations from scratch, and inherited empty tables would collide
      // with the CREATE TABLEs those migrations issue. Nothing outside the
      // schema references into it, so removing it dangles nothing.
      drop: "schema",
      reason:
        "Queue bookkeeping for the source database; inheriting main's crontab watermarks would skip the first run of every scheduled job. Reinstalled by the jobs plugin's onReadyBlocking when a backend boots against the forked database.",
    }),
  ],
  // The queue schema is a property of the DATABASE, and this is where this
  // backend's own database acquires it. `onReadyBlocking` completes across ALL
  // plugins before any plugin's `onReady` runs, so a plugin that tx-enqueues
  // from its own `onReady` — on a brand-new worktree database born without the
  // schema (see the fork exclusion above) — can no longer beat `startWorkers()`
  // to the punch. Putting it in `onReady` instead would only re-run the same
  // race with a shorter fuse. On an already-installed database this is one
  // connect and one `SELECT`.
  onReadyBlocking: async () => {
    await installQueueSchema(connectionString());
  },
  onReady: async () => {
    await startWorkers();
    startStuckLockSweeper();
    // Immediate boot purge of the permanently-failed backlog (idempotent; the
    // scheduled deadJobGcJob keeps it bounded thereafter). Runs after the
    // onReadyBlocking migration barrier, so dead_jobs exists. Fire-and-forget:
    // a failure surfaces as an unhandled rejection (the reports plugin files it)
    // rather than being swallowed into an invisible boot-time no-op.
    void runTracked("jobs:reconcile-dead", () => reconcileDeadJobs());
  },
  // Cron schedules are installed only after every plugin's onReady has run, so
  // resolver-form schedules (e.g. backup's, which reads config) see ready state.
  onAllReady: () => {
    installScheduledCronItems();
  },
  onShutdown: async () => {
    stopStuckLockSweeper();
    await stopWorkers();
  },
} satisfies ServerPluginDefinition;
