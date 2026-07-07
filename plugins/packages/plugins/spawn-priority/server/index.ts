import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { backgroundArgv, backgroundPrefix } from "./internal/spawn-priority";

export default {
  description:
    "OS-priority demotion for background subprocess spawns: backgroundArgv/backgroundPrefix wrap heavy background work (DB forks, agent sessions, builds, worktree checkouts) in darwinbg (taskpolicy -b) so it yields host CPU/IO to the interactive backends.",
} satisfies ServerPluginDefinition;
