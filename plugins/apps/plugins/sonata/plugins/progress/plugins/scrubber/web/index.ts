import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataPlayer } from "@plugins/apps/plugins/sonata/plugins/player/web";
import { ProgressBar } from "./components/progress-bar";
import { SonataProgress } from "./slots";

export { SonataProgress } from "./slots";
export { RAIL_HEIGHT, RAIL_BAND_Y } from "./rail-geometry";

export default {
  description:
    "Sonata Transport: a draggable progression bar for song navigation. Click/drag to seek; hosts the open SonataProgress.Marker slot for timeline markers (bars, sections, keys, …).",
  contributions: [
    // `fill`: the scrubber is the strip's growing cell, between play and loop.
    SonataPlayer.Transport({
      id: "progress-bar",
      component: ProgressBar,
      fill: true,
    }),
  ],
  slots: SonataProgress,
} satisfies PluginDefinition;
