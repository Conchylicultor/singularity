import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBuildProfiling } from "./internal/handle-build-profiling";
import { handleBuildDetail } from "./internal/handle-build-detail";
import { getBuildProfiling, getBuildRunProfileByWorktree } from "../shared/endpoints";

export default {
  description: "Build step profiling data endpoint.",
  httpRoutes: {
    [getBuildProfiling.route]: handleBuildProfiling,
    [getBuildRunProfileByWorktree.route]: handleBuildDetail,
  },
} satisfies ServerPluginDefinition;
