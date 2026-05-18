import type { ServerPluginDefinition } from "@server/types";
import { handleBuildRunProfiling } from "./internal/handle-build-run-profiling";
import { getBuildRunProfile } from "../shared/endpoints";

export default {
  id: "build-build-profiling",
  name: "Build: Profiling",
  description: "Per-run build profiling data endpoint.",
  httpRoutes: {
    [getBuildRunProfile.route]: handleBuildRunProfiling,
  },
} satisfies ServerPluginDefinition;
