import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleWaitTime } from "./internal/handle-wait-time";
import { handleThroughput } from "./internal/handle-throughput";
import { handleStepBreakdown } from "./internal/handle-step-breakdown";
import {
  getPushesWaitTime,
  getPushesThroughput,
  getPushesStepBreakdown,
} from "../shared/endpoints";

export default {
  id: "stats-pushes",
  name: "Stats: Pushes",
  description:
    "Push contention stats: wait time, throughput, and step breakdown.",
  httpRoutes: {
    [getPushesWaitTime.route]: handleWaitTime,
    [getPushesThroughput.route]: handleThroughput,
    [getPushesStepBreakdown.route]: handleStepBreakdown,
  },
} satisfies ServerPluginDefinition;
