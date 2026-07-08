import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { ContentionLane } from "./components/contention-lane";

export default {
  description:
    "Contention trace lane: a footer card of the cluster-wide system-contention snapshot (OS load average vs cores, Postgres backend counts, top databases) at the trip instant.",
  contributions: [Trace.Lane({ match: "contention", component: ContentionLane })],
} satisfies PluginDefinition;
