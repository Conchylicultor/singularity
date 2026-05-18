import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBuildProfiling } from "./internal/handle-build-profiling";
import { getBuildProfiling } from "../shared/endpoints";

export default {
  id: "debug-profiling-build",
  name: "Build Profiling",
  description: "Build step profiling data endpoint.",
  httpRoutes: {
    [getBuildProfiling.route]: handleBuildProfiling,
  },
} satisfies ServerPluginDefinition;
