import type { ServerPluginDefinition } from "@server/types";
import { handleResolve } from "./internal/resolve-handler";

export default {
  id: "code-explorer-file-resolve",
  name: "Code Explorer: File Resolve",
  description:
    "Fuzzy file path resolution via segment-subsequence matching against git ls-files.",
  httpRoutes: {
    "GET /api/code/:worktree/resolve": handleResolve,
  },
} satisfies ServerPluginDefinition;
