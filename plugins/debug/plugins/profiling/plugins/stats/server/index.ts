import type { ServerPluginDefinition } from "@server/types";
import { handleStatsProfiling } from "./internal/handle-stats-profiling";
import { getStatsProfiling } from "../shared/endpoints";

export default {
  id: "debug-profiling-stats",
  name: "Stats Profiling",
  description: "Stats endpoint profiling data endpoint.",
  httpRoutes: {
    [getStatsProfiling.route]: handleStatsProfiling,
  },
} satisfies ServerPluginDefinition;
