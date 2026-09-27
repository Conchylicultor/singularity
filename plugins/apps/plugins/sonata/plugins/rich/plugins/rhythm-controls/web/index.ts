import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGraphicEq } from "react-icons/md";
import {
  Sonata,
  grooveSetting,
  useHasVoicedChords,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { RhythmObserver } from "./components/rhythm-observer";
import { RhythmControls } from "./components/rhythm-controls";
import { RhythmActions } from "./components/rhythm-actions";

export { useSaveRhythm } from "./actions";
export type { RhythmGroove } from "./actions";

export default {
  description:
    "Sonata Section: per-song rhythm circle. A left-hand (bass) and right-hand (chords) onset necklace that spins with the playhead, persists per song, and feeds the shell's score pipeline as a per-song setting (Sonata.SongSetting) settled by a headless observer. Shown only for songs whose chords the shell voices: a symbol source (authored chords), or chord mode on.",
  contributions: [
    Sonata.SongSetting({
      id: "rhythm-sync",
      setting: grooveSetting,
      component: RhythmObserver,
    }),
    Sonata.Section({
      id: "rhythm",
      label: "Rhythm",
      icon: MdGraphicEq,
      component: RhythmControls,
      area: "player",
      actions: RhythmActions,
      useAvailable: useHasVoicedChords,
    }),
  ],
} satisfies PluginDefinition;
