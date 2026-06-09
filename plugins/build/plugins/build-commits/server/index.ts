import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBuildRunCommits } from "./internal/handle-build-run-commits";
import { getBuildRunCommits } from "../shared";

export default {
  description: "Per-run commit list data endpoint.",
  httpRoutes: {
    [getBuildRunCommits.route]: handleBuildRunCommits,
  },
} satisfies ServerPluginDefinition;
