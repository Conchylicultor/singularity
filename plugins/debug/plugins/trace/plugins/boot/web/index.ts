import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Trace } from "@plugins/debug/plugins/trace/plugins/engine/web";
import { BootLane } from "./components/boot-lane";

export default {
  description:
    "Boot trace lane: a self-contained phase-grouped Gantt card of the server-boot profile (gateway readiness wait, per-phase spans, memory checkpoints) on the boot section's own clock axis.",
  contributions: [Trace.Lane({ match: "boot", component: BootLane })],
} satisfies PluginDefinition;
