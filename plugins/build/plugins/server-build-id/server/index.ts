import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
export { getServerCommit } from "./internal/get-server-commit";
export { getServerGraphHash } from "./internal/get-server-graph-hash";
export default {
  description:
    "Served-bundle pin leaf: reads the .build-commit (the tree the bundle was built from) and .build-graph (content identity of the served web graph) trailers out of the served dist, fresh on every call. A leaf so the deployment description and stale-tab detection read them without importing the heavy build barrel (which pulls git-watcher/worktree).",
  contributions: [],
} satisfies ServerPluginDefinition;
