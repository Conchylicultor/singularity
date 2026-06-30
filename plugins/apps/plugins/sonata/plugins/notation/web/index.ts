import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdMusicNote } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { Notation } from "./components/notation";
import { notationConfig } from "../shared/config";

export default {
  description:
    "Sonata Display: standard staff notation. Engraves the score as a grand staff (treble + bass) with clefs, key/time signatures, barlines, accidentals and rests, following playback with a moving playhead, active-note highlight and auto-scroll. A reading view (no time-axis / pitch-plane capabilities); click a note to seek.",
  contributions: [
    // `match` is the dispatch key the shell selects on (`key: activeDisplayId`);
    // it equals `id` so the picker's id and the dispatch key stay in lockstep.
    // No capabilities: a reading view publishes no pixel geometry, so the
    // capability-filtered overlays / pitch-axis correctly don't mount here.
    Sonata.Display({
      match: "notation",
      id: "notation",
      label: "Notation",
      icon: MdMusicNote,
      capabilities: [],
      component: Notation,
    }),
    ConfigV2.WebRegister({ descriptor: notationConfig }),
    // Surface the notation prefs in the player's view-options chip.
    Sonata.ViewOption({
      id: "notation",
      config: notationConfig,
      fields: ["showChordSymbols"],
    }),
  ],
} satisfies PluginDefinition;
