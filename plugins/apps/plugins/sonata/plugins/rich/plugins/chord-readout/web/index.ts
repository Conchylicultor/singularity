import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordReadout } from "./components/chord-readout";

export default {
  id: "sonata-rich-chord-readout",
  name: "Sonata: Chord Readout",
  description:
    "Sonata Section: a large current-chord readout panel that tracks the playback cursor, reading the shared Score + cursor from useSonata().",
  contributions: [
    Sonata.Section({
      id: "chord-readout",
      label: "Current chord",
      icon: MdMusicNote,
      component: ChordReadout,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
