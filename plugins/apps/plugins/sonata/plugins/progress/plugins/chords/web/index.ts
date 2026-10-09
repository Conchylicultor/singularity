import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { ChordLane } from "./components/chord-lane";

export default {
  description:
    "Sonata progress marker: the chord lane — one chip per chord above the progression bar, sized by its duration and labelled in the shared chord-label mode, the chord under the playhead highlighted.",
  contributions: [
    SonataProgress.Marker({ id: "chords", component: ChordLane }),
  ],
} satisfies PluginDefinition;
