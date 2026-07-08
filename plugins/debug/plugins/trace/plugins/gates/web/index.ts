import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { GatesLane } from "./components/gates-lane";

export default {
  description:
    "Gates trace lane: a point-in-time gate-occupancy strip (active/max + queued per concurrency layer, saturated gates highlighted) at the trip instant.",
  contributions: [Trace.Lane({ match: "gates", component: GatesLane })],
} satisfies PluginDefinition;
