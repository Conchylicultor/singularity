import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { bootClass } from "./internal/class";

export default {
  description:
    "Built-in trace event class 'boot': the server-boot profile (phase spans + memory checkpoints + optional gateway readiness wait) pre-aggregated by debug/boot-monitor and passed in via the boot trigger's detail.",
  contributions: [bootClass.contribution],
} satisfies ServerPluginDefinition;
