import type { ServerPluginDefinition } from "@server/types";
import { handleBuildRunProfiling } from "./internal/handle-build-run-profiling";

export default {
  id: "build-build-profiling",
  name: "Build: Profiling",
  description: "Per-run build profiling data endpoint.",
  httpRoutes: {
    "GET /api/build/runs/:id/profile": handleBuildRunProfiling,
  },
} satisfies ServerPluginDefinition;
