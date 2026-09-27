import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Sonata,
  useHasChords,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordProgression } from "./components/chord-progression";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Sonata Section: a rhythm-aware chord-progression strip of chips, laid out bar-by-bar and sized by duration, highlighting the chord under the playhead and seeking on click.",
  contributions: [
    Sonata.Section({
      id: "chord-progression",
      label: "Progression",
      icon: symbol("queue-music"),
      component: ChordProgression,
      area: "player",
      useAvailable: useHasChords,
    }),
  ],
} satisfies PluginDefinition;
