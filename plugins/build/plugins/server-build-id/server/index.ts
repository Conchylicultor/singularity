import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
export { getServerBuildId } from "./internal/get-server-build-id";
export default {
  description:
    "Server build-id leaf: reads the .build-id baked into the served bundle. A leaf so stale-tab detection reads it without importing the heavy build barrel (which pulls git-watcher/worktree).",
  contributions: [],
} satisfies ServerPluginDefinition;
