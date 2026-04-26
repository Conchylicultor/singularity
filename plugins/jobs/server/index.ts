import type { ServerPluginDefinition } from "@server/types";
import {
  handleCancelJob,
  handleListJobs,
  handleRetryJob,
} from "./internal/handle";
// Side-effect import: registers the `jobs.resume` builtin so it's in
// `jobRegistry` before any `ctx.waitFor` / `ctx.sleep` call schedules one.
import "./internal/resume-job";
import { startWorker, stopWorker } from "./internal/worker";

export { defineJob, UNSAFE_getRegisteredJob, DEFAULT_MAX_ATTEMPTS } from "./internal/registry";
export type {
  DefineJobSpec,
  JobCtx,
  JobFactory,
  RegisteredJob,
} from "./internal/registry";
export {
  isSuspendSignal,
  UNSAFE_installDurableHooks,
} from "./internal/step-ctx";
export type { DurableHooks } from "./internal/step-ctx";

export default {
  id: "jobs",
  name: "Jobs",
  description:
    "Durable background jobs primitive built on graphile-worker. Plugins declare jobs via defineJob and enqueue via job.enqueue.",
  httpRoutes: {
    "GET /api/jobs": handleListJobs,
    "POST /api/jobs/:id/retry": handleRetryJob,
    "DELETE /api/jobs/:id": handleCancelJob,
  },
  onReady: async () => {
    await startWorker();
  },
  onShutdown: async () => {
    await stopWorker();
  },
} satisfies ServerPluginDefinition;
