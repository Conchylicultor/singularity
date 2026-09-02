import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { reportStormKind } from "./internal/report-storm-kind";

export default {
  description:
    "The report-storm report kind: validates the reports engine's fan-out collapse accounting, fingerprints per (collapsed kind, window) so each window of a long incident gets its own roster, and renders the rollup task. Declares itself fanOutExempt so the ceiling can never collapse its own accounting.",
  contributions: [reportStormKind],
} satisfies ServerPluginDefinition;
