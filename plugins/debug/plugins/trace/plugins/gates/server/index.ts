import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { gatesClass } from "./internal/class";

export default {
  description:
    "Built-in trace event class 'gates': per-concurrency-gate occupancy (active / queued / max per layer) captured synchronously at the trip instant.",
  contributions: [gatesClass.contribution],
} satisfies ServerPluginDefinition;
