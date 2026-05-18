import type { ServerPluginDefinition } from "@server/types";
import { handlePluginChanges } from "./internal/handle-plugin-changes";
import { getPluginChanges } from "../core/endpoints";

export default {
  id: "review-plugin-changes",
  name: "Review: Plugin Changes",
  description:
    "Computes structured diffs of plugin public APIs between the worktree and main.",
  httpRoutes: {
    [getPluginChanges.route]: handlePluginChanges,
  },
} satisfies ServerPluginDefinition;
