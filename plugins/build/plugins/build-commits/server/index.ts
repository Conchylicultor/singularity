import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBuildRunCommits } from "./internal/handle-build-run-commits";
import { getBuildRunCommits } from "../shared";

export default {
  id: "build-build-commits",
  name: "Build: Commits",
  description: "Per-run commit list data endpoint.",
  httpRoutes: {
    [getBuildRunCommits.route]: handleBuildRunCommits,
  },
} satisfies ServerPluginDefinition;
