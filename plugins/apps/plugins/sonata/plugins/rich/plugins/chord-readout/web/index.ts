import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { useHasChords } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordReadout } from "./components/chord-readout";
import { ChordReadoutActions } from "./components/chord-readout-actions";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Sonata Section: a large current-chord readout panel that tracks the playback cursor, reading the session's Score + cursor (useSession).",
  contributions: [
    Sonata.Section({
      id: "chord-readout",
      label: "Current chord",
      icon: symbol("music-note"),
      component: ChordReadout,
      actions: ChordReadoutActions,
      area: "player",
      useAvailable: useHasChords,
    }),
  ],
} satisfies PluginDefinition;
