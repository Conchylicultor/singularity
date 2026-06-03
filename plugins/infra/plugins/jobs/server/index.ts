import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  handleCancelJob,
  handleListJobs,
  handleRetryJob,
} from "./internal/handle";
import { jobsListResource } from "./internal/resources";
import { jobsResumeJob } from "./internal/resume-job";
import {
  startStuckLockSweeper,
  stopStuckLockSweeper,
} from "./internal/stuck-lock-sweeper";
import { startWorker, stopWorker } from "./internal/worker";
import { listJobs, retryJob, cancelJob } from "../core/endpoints";

export { defineJob, UNSAFE_getRegisteredJob, getAllRegisteredJobNames, DEFAULT_MAX_ATTEMPTS } from "./internal/registry";
export { sweepOnce as UNSAFE_sweepStuckLocks } from "./internal/stuck-lock-sweeper";
export type {
  DefineJobSpec,
  EnqueueOpts,
  EnqueueTx,
  JobCtx,
  JobFactory,
  RegisteredJob,
} from "./internal/registry";
export {
  isSuspendSignal,
  UNSAFE_installDurableHooks,
} from "./internal/step-ctx";
export type { DurableHooks } from "./internal/step-ctx";
export { jobsListResource } from "./internal/resources";

export default {
  name: "Jobs",
  description:
    "Durable background jobs primitive built on graphile-worker. Plugins declare jobs via defineJob and enqueue via job.enqueue.",
  loadBearing: true,
  httpRoutes: {
    [listJobs.route]: handleListJobs,
    [retryJob.route]: handleRetryJob,
    [cancelJob.route]: handleCancelJob,
  },
  register: [jobsResumeJob],
  contributions: [Resource.Declare(jobsListResource)],
  onReady: async () => {
    await startWorker();
    startStuckLockSweeper();
  },
  onShutdown: async () => {
    stopStuckLockSweeper();
    await stopWorker();
  },
} satisfies ServerPluginDefinition;
