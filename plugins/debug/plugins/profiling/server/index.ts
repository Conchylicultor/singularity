import type { ServerPluginDefinition } from "@server/types";
import { handleProfiling } from "./internal/handle-profiling";

export default {
  id: "debug-profiling",
  name: "Boot Profiling",
  description: "Startup profiling spans for the Gantt debug pane.",
  httpRoutes: {
    "GET /api/debug/profiling": handleProfiling,
  },
} satisfies ServerPluginDefinition;
