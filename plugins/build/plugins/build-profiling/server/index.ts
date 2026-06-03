import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBuildRunProfiling } from "./internal/handle-build-run-profiling";
import { getBuildRunProfile } from "../shared/endpoints";

export default {
  name: "Build: Profiling",
  description: "Per-run build profiling data endpoint.",
  httpRoutes: {
    [getBuildRunProfile.route]: handleBuildRunProfiling,
  },
} satisfies ServerPluginDefinition;
