import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { SpansLane } from "./components/spans-lane";

export default {
  description:
    "Spans trace lane: the flight window rendered as a nested call-tree waterfall — one window-relative Gantt row per span instance, depth-indented under its true parent (per-instance parentId), collapsible, with wait/work segments and a click-to-detail bar.",
  contributions: [Trace.Lane({ match: "spans", component: SpansLane })],
} satisfies PluginDefinition;
