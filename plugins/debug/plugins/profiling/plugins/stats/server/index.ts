import type { ServerPluginDefinition } from "@server/types";
import { handleStatsProfiling } from "./internal/handle-stats-profiling";

export default {
  id: "debug-profiling-stats",
  name: "Stats Profiling",
  description: "Stats endpoint profiling data endpoint.",
  httpRoutes: {
    "GET /api/debug/profiling/stats": handleStatsProfiling,
  },
} satisfies ServerPluginDefinition;
