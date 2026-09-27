import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { worktreeOpsServed } from "./internal/resource";
import { startOpWatcher, stopOpWatcher } from "./internal/watcher";

export default {
  description:
    "Watches the per-worktree build/push op markers and pushes them to the worktree-ops live value. Renders a banner above the prompt input showing the in-flight operation (build / push / push queued waiting for lock) with elapsed time.",
  contributions: [...worktreeOpsServed.declare],
  onReady: async () => {
    await startOpWatcher();
  },
  onShutdown: async () => {
    await stopOpWatcher();
  },
} satisfies ServerPluginDefinition;
