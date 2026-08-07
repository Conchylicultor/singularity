import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getBuildRunTermination } from "../core";
import { handleBuildRunTermination } from "./internal/handle-build-run-termination";

export default {
  description:
    "Per-run termination endpoint: what the host-global signal-origin sink recorded about the death of one build run (which signal, and who sent it).",
  httpRoutes: {
    [getBuildRunTermination.route]: handleBuildRunTermination,
  },
} satisfies ServerPluginDefinition;
