import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGraphicEq } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { RhythmObserver } from "./components/rhythm-observer";
import { RhythmControls } from "./components/rhythm-controls";

export { useSaveRhythm } from "./actions";
export type { RhythmGroove } from "./actions";

export default {
  description:
    "Sonata Section: per-song rhythm circle. A left-hand (bass) and right-hand (chords) onset necklace that spins with the playhead, persists per song, and feeds the shell's score pipeline via a headless Sonata.Effect observer. Shown only for songs with authored chord annotations.",
  contributions: [
    Sonata.Effect({ id: "rhythm-sync", component: RhythmObserver }),
    Sonata.Section({
      id: "rhythm",
      label: "Rhythm",
      icon: MdGraphicEq,
      component: RhythmControls,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
