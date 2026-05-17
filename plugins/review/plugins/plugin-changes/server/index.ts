import type { ServerPluginDefinition } from "@server/types";
import { handlePluginChanges } from "./internal/handle-plugin-changes";

export default {
  id: "review-plugin-changes",
  name: "Review: Plugin Changes",
  description:
    "Computes structured diffs of plugin public APIs between the worktree and main.",
  httpRoutes: {
    "GET /api/review/plugin-changes": handlePluginChanges,
  },
} satisfies ServerPluginDefinition;
