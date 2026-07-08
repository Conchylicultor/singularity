import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { traceConfig } from "../core";

export { Trace } from "./slots";
export type {
  TraceLaneProps,
  TraceTriggerSummaryProps,
  TraceSelection,
  TraceSelectionField,
} from "./slots";

// Re-export the read-side endpoint contracts (this plugin's own shared/ file) so
// the separate `pane` plugin can consume them without reaching into shared/
// (R10). The write-side `testTrigger` stays engine-private.
export { listTraces, getTrace } from "../shared/endpoints";
export type { TraceListItem } from "../shared/endpoints";

export default {
  description:
    "Trace-engine web surface: the Trace.Lane / Trace.TriggerSummary dispatch slots (with generic fallbacks so a new event class or trigger kind is visible by default), plus the trace config registration for Settings → Config.",
  contributions: [ConfigV2.WebRegister({ descriptor: traceConfig })],
} satisfies PluginDefinition;
