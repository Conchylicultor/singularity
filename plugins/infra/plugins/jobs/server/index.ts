import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
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
  id: "jobs",
  name: "Jobs",
  description:
    "Durable background jobs primitive built on graphile-worker. Plugins declare jobs via defineJob and enqueue via job.enqueue.",
  loadBearing: true,
  httpRoutes: {
    "GET /api/jobs": handleListJobs,
    "POST /api/jobs/:id/retry": handleRetryJob,
    "DELETE /api/jobs/:id": handleCancelJob,
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
