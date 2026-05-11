import type { ServerPluginDefinition } from "@server/types";
import { handleBuildProfiling } from "./internal/handle-build-profiling";

export default {
  id: "debug-profiling-build",
  name: "Build Profiling",
  description: "Build step profiling data endpoint.",
  httpRoutes: {
    "GET /api/debug/profiling/build": handleBuildProfiling,
  },
} satisfies ServerPluginDefinition;
