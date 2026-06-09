import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PlaybackControls } from "./components/playback-controls";

export default {
  description:
    "Sonata toolbar transport: play/pause button and a Synthesia-style speed stepper ([− xx% +]) with live BPM. Contributes to Sonata.Toolbar.",
  contributions: [
    Sonata.Toolbar({ id: "playback", component: PlaybackControls }),
  ],
} satisfies PluginDefinition;
