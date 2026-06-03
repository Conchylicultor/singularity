import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleStatsProfiling } from "./internal/handle-stats-profiling";
import { getStatsProfiling } from "../shared/endpoints";

export default {
  name: "Stats Profiling",
  description: "Stats endpoint profiling data endpoint.",
  httpRoutes: {
    [getStatsProfiling.route]: handleStatsProfiling,
  },
} satisfies ServerPluginDefinition;
