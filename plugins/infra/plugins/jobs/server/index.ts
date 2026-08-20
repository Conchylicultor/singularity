import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { ExcludeSchemaFromFork } from "@plugins/database/plugins/admin/server";
import {
  handleCancelJob,
  handleListDeadJobs,
  handleListJobs,
  handleRetryJob,
} from "./internal/handle";
import { deadJobGcJob, reconcileDeadJobs } from "./internal/dead-job-gc";
import { deadJobsResource, jobsListResource } from "./internal/resources";
import { jobsResumeJob } from "./internal/resume-job";
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
    // scheduled job. Graphile re-migrates the schema idempotently on first
    // worker start, so dropping it costs nothing.
    //
    // The fork used to copy this schema and then `DROP SCHEMA ... CASCADE` it
    // afterwards. Excluding it at dump time reaches the same end state without
    // the copy.
    ExcludeSchemaFromFork({
      schema: "graphile_worker",
      // The whole schema, not just its rows: Graphile re-runs its own migrations
      // on first worker start, and inherited empty tables would collide with the
      // CREATE TABLEs those migrations issue. Nothing outside the schema
      // references into it, so removing it dangles nothing.
      drop: "schema",
      reason:
        "Queue bookkeeping for the source database; inheriting main's crontab watermarks would skip the first run of every scheduled job. Re-migrated on first worker start.",
    }),
  ],
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
