import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { databaseForkJob } from "./internal/fork-job";
import { forkTempSweepJob } from "./internal/fork-temp-sweep";

export { databaseForkJob } from "./internal/fork-job";

export default {
  description:
    "Durable, self-healing worktree DB fork: a graphile job that forks the singularity DB per worktree (idempotent, atomic), plus a scheduled sweep of orphaned temp forks.",
  register: [databaseForkJob, forkTempSweepJob],
} satisfies ServerPluginDefinition;
