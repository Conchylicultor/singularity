import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PlaybackControls } from "./components/playback-controls";

export default {
  description:
    "Sonata toolbar transport: play/pause button and a Synthesia-style speed stepper ([− xx% +]) with live BPM. Contributes to the Sonata toolbar's End zone.",
  contributions: [
    SonataToolbar.End({ id: "playback", component: PlaybackControls }),
  ],
} satisfies PluginDefinition;
