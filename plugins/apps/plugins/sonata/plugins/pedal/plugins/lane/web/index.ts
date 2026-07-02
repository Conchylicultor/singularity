import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PedalLane } from "./components/pedal-lane";

export default {
  description:
    "Sonata piano-roll sustain-pedal lane: a scroll-synced strip marking pedal-down spans along the falling-note timeline.",
  contributions: [
    Sonata.TransportOverlay({
      id: "pedal",
      requires: ["time-axis"],
      component: PedalLane,
    }),
  ],
} satisfies PluginDefinition;
