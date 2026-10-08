import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { SonataPlayer } from "@plugins/apps/plugins/sonata/plugins/player/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { ChordChart } from "./components/chord-chart";
import { chordChartConfig } from "../shared/config";

export default {
  description:
    "Sonata Display: the chord grid. Lays the song's chords out as bars in rows of four under their section headers, each bar split by beats into chord boxes painted in the root's degree colour (held chords drawn as ties), labelled by the shared chord-label mode, optionally with the songsheet lines sung in each row printed under it (the Lyrics under bars view option), following playback with the active bar washed, the sounding chord ringed and a beat line through the bar. A reading view (no time-axis / pitch-plane capabilities); click a chord to seek.",
  contributions: [
    // `match` is the dispatch key the player selects on; it equals `id` so the
    // picker's id and the dispatch key stay in lockstep. No capabilities: a
    // reading view publishes no pixel geometry.
    SonataPlayer.Display({
      match: "chord-chart",
      id: "chord-chart",
      label: "Chord grid",
      icon: symbol("grid-view"),
      capabilities: [],
      component: ChordChart,
    }),
    ConfigV2.WebRegister({ descriptor: chordChartConfig }),
    // The grid's own options (lyrics under the bars) in the View popover, only
    // while the chord grid is the display.
    Sonata.ViewOption({
      id: "chord-chart-lyrics",
      displays: ["chord-chart"],
      config: chordChartConfig,
    }),
  ],
} satisfies PluginDefinition;
