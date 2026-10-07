import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { useHasChords } from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { ChordList } from "./components/chord-list";

export default {
  description:
    "Sonata Section: the song's chords — one row per distinct chord in order of first appearance, each a chord box (degree colour, chord-label mode) beside a keyboard lit with its notes in that colour and how many times it is played. The chord under the playhead is marked; clicking a row seeks to its first occurrence.",
  contributions: [
    Sonata.Section({
      id: "chord-list",
      // Not "Chords": that is chord-mode's card (the On/Off chip), shown beside
      // this one for a song with detected chords.
      label: "Chord list",
      icon: symbol("piano"),
      component: ChordList,
      area: "player",
      useAvailable: useHasChords,
    }),
  ],
} satisfies PluginDefinition;
