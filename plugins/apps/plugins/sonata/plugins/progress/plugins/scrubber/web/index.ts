import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ProgressBar } from "./components/progress-bar";

export { SonataProgress } from "./slots";
export { RAIL_THICKNESS, railBandClass } from "./rail-geometry";

export default {
  description:
    "Sonata Transport: a draggable progression bar for song navigation. Click/drag to seek; hosts the open SonataProgress.Marker slot for timeline markers (bars, sections, keys, …).",
  contributions: [
    Sonata.Transport({ id: "progress-bar", component: ProgressBar }),
  ],
} satisfies PluginDefinition;
