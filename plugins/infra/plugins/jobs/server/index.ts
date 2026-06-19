import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
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
  startWorker,
  stopWorker,
} from "./internal/worker";
import { listJobs, listDeadJobs, retryJob, cancelJob } from "../core/endpoints";

export { defineJob, UNSAFE_getRegisteredJob, getAllRegisteredJobNames, DEFAULT_MAX_ATTEMPTS } from "./internal/registry";
export { sweepOnce as UNSAFE_sweepStuckLocks } from "./internal/stuck-lock-sweeper";
export type {
  DefineJobSpec,
  EnqueueOpts,
  EnqueueTx,
  JobCtx,
  JobFactory,
  RegisteredJob,
  ScheduleSpec,
} from "./internal/registry";
export {
  isSuspendSignal,
  UNSAFE_installDurableHooks,
} from "./internal/step-ctx";
export type { DurableHooks } from "./internal/step-ctx";
export { jobsListResource, deadJobsResource } from "./internal/resources";

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
  ],
  onReady: async () => {
    await startWorker();
    startStuckLockSweeper();
    // Immediate boot purge of the permanently-failed backlog (idempotent; the
    // scheduled deadJobGcJob keeps it bounded thereafter). Runs after the
    // onReadyBlocking migration barrier, so dead_jobs exists. Fire-and-forget:
    // a failure surfaces as an unhandled rejection (the reports plugin files it)
    // rather than being swallowed into an invisible boot-time no-op.
    void reconcileDeadJobs();
  },
  // Cron schedules are installed only after every plugin's onReady has run, so
  // resolver-form schedules (e.g. backup's, which reads config) see ready state.
  onAllReady: () => {
    installScheduledCronItems();
  },
  onShutdown: async () => {
    stopStuckLockSweeper();
    await stopWorker();
  },
} satisfies ServerPluginDefinition;
