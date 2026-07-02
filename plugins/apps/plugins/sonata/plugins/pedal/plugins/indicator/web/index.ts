import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PedalIndicator } from "./components/pedal-indicator";

export default {
  description:
    "Sonata toolbar sustain-pedal indicator: a cross-lens 'Ped.' chip that glows while the pedal is engaged during playback.",
  contributions: [
    SonataToolbar.End({ id: "pedal-indicator", component: PedalIndicator }),
  ],
} satisfies PluginDefinition;
