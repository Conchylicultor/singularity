import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBuildRunLogs } from "./internal/handle-build-run-logs";
import { getBuildRunLogs } from "../shared/endpoints";

export default {
  name: "Build: Logs",
  description: "Per-run build log data endpoint.",
  httpRoutes: {
    [getBuildRunLogs.route]: handleBuildRunLogs,
  },
} satisfies ServerPluginDefinition;
