import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGraphicEq } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { PianoRoll } from "./components/piano-roll";

export default {
  id: "sonata-piano-roll",
  name: "Sonata: Piano Roll",
  description:
    "Sonata Display: Synthesia-like pitch × time piano roll. Draws notes via its published Projection (time-axis + pitch-plane capabilities), auto-scrolls the time axis to keep the playback cursor in view, and hosts capability-compatible overlays.",
  contributions: [
    // `match` is the dispatch key the shell selects on (`key: activeDisplayId`).
    // It equals `id` here so the picker's id and the dispatch key stay in lockstep.
    Sonata.Display({
      match: "piano-roll",
      id: "piano-roll",
      label: "Piano Roll",
      icon: MdGraphicEq,
      capabilities: ["time-axis", "pitch-plane"],
      component: PianoRoll,
    }),
  ],
} satisfies PluginDefinition;
