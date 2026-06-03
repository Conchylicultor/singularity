import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  handleRuntimeProfiling,
  handleResetRuntimeProfiling,
} from "./internal/handle-runtime-profiling";
import { runtimeProfileTool } from "./internal/mcp-tools";
import {
  getRuntimeProfile,
  resetRuntimeProfile,
} from "../shared/endpoints";

export default {
  name: "Runtime Profiling",
  description: "Runtime HTTP/DB/loader profiling tables in the Gantt debug pane.",
  httpRoutes: {
    [getRuntimeProfile.route]: handleRuntimeProfiling,
    [resetRuntimeProfile.route]: handleResetRuntimeProfiling,
  },
  register: [runtimeProfileTool],
} satisfies ServerPluginDefinition;
