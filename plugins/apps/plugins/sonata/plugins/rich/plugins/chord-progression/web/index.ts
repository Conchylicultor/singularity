import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdQueueMusic } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordProgression } from "./components/chord-progression";

export default {
  description:
    "Sonata Section: a rhythm-aware chord-progression strip of chips, laid out bar-by-bar and sized by duration, highlighting the chord under the playhead and seeking on click.",
  contributions: [
    Sonata.Section({
      id: "chord-progression",
      label: "Progression",
      icon: MdQueueMusic,
      component: ChordProgression,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
