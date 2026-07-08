import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { spansClass } from "./internal/class";

export default {
  description:
    "Built-in trace event class 'spans': the flight window (open + recently-completed spans with wait/child/self decomposition) captured synchronously at the trip instant.",
  contributions: [spansClass.contribution],
} satisfies ServerPluginDefinition;
