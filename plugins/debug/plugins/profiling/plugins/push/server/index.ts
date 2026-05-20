import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handlePushProfiling } from "./internal/handle-push-profiling";
import { getPushProfiling } from "../shared/endpoints";

export default {
  id: "debug-profiling-push",
  name: "Push Profiling",
  description: "Push contention profiling data endpoint.",
  httpRoutes: {
    [getPushProfiling.route]: handlePushProfiling,
  },
} satisfies ServerPluginDefinition;
