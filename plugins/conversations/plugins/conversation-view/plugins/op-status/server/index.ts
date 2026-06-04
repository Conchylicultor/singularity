import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { worktreeOpsResource } from "./internal/resource";
import { startOpWatcher, stopOpWatcher } from "./internal/watcher";

export { worktreeOpsResource } from "./internal/resource";

export default {
  name: "Conversation View: Op Status",
  description:
    "Watches the per-worktree build/push op markers and pushes them to a live-state resource. Renders a banner above the prompt input showing the in-flight operation (build / push / push queued waiting for lock) with elapsed time.",
  contributions: [Resource.Declare(worktreeOpsResource)],
  onReady: async () => {
    await startOpWatcher();
  },
  onShutdown: async () => {
    await stopOpWatcher();
  },
} satisfies ServerPluginDefinition;
