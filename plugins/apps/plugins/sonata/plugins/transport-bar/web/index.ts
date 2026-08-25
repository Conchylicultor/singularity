import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { sonataPlayerPane } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { PlaybackControls } from "./components/playback-controls";

export default {
  description:
    "Sonata toolbar transport: play/pause button and a Synthesia-style speed stepper ([− xx% +]) with live BPM. Contributes to the Sonata player pane's header.",
  contributions: [
    sonataPlayerPane.Actions({ id: "playback", component: PlaybackControls }),
  ],
} satisfies PluginDefinition;
