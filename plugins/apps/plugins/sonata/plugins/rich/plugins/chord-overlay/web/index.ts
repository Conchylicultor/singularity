import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordOverlay } from "./components/chord-overlay";

export default {
  name: "Sonata: Chord Overlay",
  description:
    "Sonata Overlay: labels chord annotations along the timeline. Requires the time-axis capability, so it renders on the piano roll and any future time-based display.",
  contributions: [
    Sonata.Overlay({
      id: "chord-overlay",
      annotationType: "chord",
      requires: ["time-axis"],
      component: ChordOverlay,
    }),
  ],
} satisfies PluginDefinition;
