import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { backgroundArgv, backgroundPrefix, boostInteractiveQos } from "./internal/spawn-priority";

export default {
  description:
    "OS scheduling-priority isolation: backgroundArgv/backgroundPrefix wrap heavy background work (DB forks, agent sessions, builds, worktree checkouts, type-check workers) in darwinbg (taskpolicy -b) so it yields host CPU/IO to the interactive backends; boostInteractiveQos raises the calling thread to user-interactive QoS (main backend's event loop only).",
} satisfies ServerPluginDefinition;
