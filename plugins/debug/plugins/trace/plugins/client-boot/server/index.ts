import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { clientBootClass } from "./internal/class";

export default {
  description:
    "Built-in trace event class 'client-boot': the browser's own boot decomposition (spans, navigation/paint timing, long tasks, trimmed assets + rollup), built client-side and carried in the page-load slow-op beacon via the trigger's detail.",
  contributions: [clientBootClass.contribution],
} satisfies ServerPluginDefinition;
