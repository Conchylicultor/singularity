import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Sonata,
  useHasChords,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordReadout } from "./components/chord-readout";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Sonata Section: a large current-chord readout panel that tracks the playback cursor, reading the shared Score + cursor from useSonata().",
  contributions: [
    Sonata.Section({
      id: "chord-readout",
      label: "Current chord",
      icon: symbol("music-note"),
      component: ChordReadout,
      area: "player",
      useAvailable: useHasChords,
    }),
  ],
} satisfies PluginDefinition;
