import type { ServerPluginDefinition } from "@server/types";
import { startWorker, stopWorker } from "./internal/worker";

export { defineJob, UNSAFE_getRegisteredJob, DEFAULT_MAX_ATTEMPTS } from "./internal/registry";
export type {
  DefineJobSpec,
  JobCtx,
  JobFactory,
  RegisteredJob,
} from "./internal/registry";

export default {
  id: "jobs",
  name: "Jobs",
  description:
    "Durable background jobs primitive built on graphile-worker. Plugins declare jobs via defineJob and enqueue via job.enqueue.",
  onReady: async () => {
    await startWorker();
  },
  onShutdown: async () => {
    await stopWorker();
  },
} satisfies ServerPluginDefinition;
