import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLyrics } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Songsheet } from "./components/songsheet";

export default {
  description:
    "Sonata Display: a chord-over-lyrics songsheet. Renders the score's lyric lines with chords printed over each column, grouped by section, highlighting and auto-scrolling the line under the playback cursor. A reading view (no time-axis / pitch-plane capabilities); click a line to seek.",
  contributions: [
    // `match` is the dispatch key the shell selects on (`key: activeDisplayId`);
    // it equals `id` so the picker's id and the dispatch key stay in lockstep.
    // No capabilities: a reading view publishes no pixel geometry, so the
    // capability-filtered overlays / pitch-axis correctly don't mount here.
    Sonata.Display({
      match: "songsheet",
      id: "songsheet",
      label: "Songsheet",
      icon: MdLyrics,
      capabilities: [],
      component: Songsheet,
    }),
  ],
} satisfies PluginDefinition;
