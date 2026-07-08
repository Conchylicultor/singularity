import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { SpansLane } from "./components/spans-lane";

export default {
  description:
    "Spans trace lane: the flight window (open + recently-completed spans) rendered as window-relative Gantt bars grouped by span kind, one row per (kind,label), with wait/work segments and a click-to-detail bar.",
  contributions: [Trace.Lane({ match: "spans", component: SpansLane })],
} satisfies PluginDefinition;
