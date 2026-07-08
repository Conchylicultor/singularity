import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { StallLane } from "./components/stall-lane";

export default {
  description:
    "Stall trace lane: a histogram card of the sampled JS call stacks (top frames + collapsed stack signatures) captured during an event-loop freeze.",
  contributions: [Trace.Lane({ match: "stall", component: StallLane })],
} satisfies PluginDefinition;
