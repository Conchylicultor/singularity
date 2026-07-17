import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { ClientBootLane } from "./components/client-boot-lane";

export default {
  description:
    "Client-boot trace lane: the browser's own boot decomposition rendered as the embedded Boot Profile Gantt on a slow page-load trace, with the trimmed-asset rollup caption.",
  contributions: [Trace.Lane({ match: "client-boot", component: ClientBootLane })],
} satisfies PluginDefinition;
