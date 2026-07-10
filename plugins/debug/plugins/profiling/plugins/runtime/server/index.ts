import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  handleRuntimeProfiling,
  handleResetRuntimeProfiling,
} from "./internal/handle-runtime-profiling";
import { handleFlightWindow } from "./internal/handle-flight-window";
import { runtimeProfileTool } from "./internal/mcp-tools";
import {
  getFlightWindow,
  getRuntimeProfile,
  resetRuntimeProfile,
} from "../shared/endpoints";

export default {
  description: "Runtime HTTP/DB/loader profiling tables in the Gantt debug pane.",
  httpRoutes: {
    [getRuntimeProfile.route]: handleRuntimeProfiling,
    [resetRuntimeProfile.route]: handleResetRuntimeProfiling,
    [getFlightWindow.route]: handleFlightWindow,
  },
  register: [runtimeProfileTool],
} satisfies ServerPluginDefinition;
