import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Reports } from "@plugins/reports/web";
import { SPAN_STUCK_KIND } from "../core";
import { SpanStuckSummary } from "./components/span-stuck-summary";

export default {
  description:
    "Stuck-span report renderer: a one-line Debug → Reports summary for the span-stuck kind (how long it has been running, the chain of operations it is stuck under, and a View-trace chip).",
  contributions: [
    Reports.KindView({ match: SPAN_STUCK_KIND, component: SpanStuckSummary }),
  ],
} satisfies PluginDefinition;
