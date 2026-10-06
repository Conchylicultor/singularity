import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  grooveSetting,
  SonataDocument,
  useHasVoicedChords,
} from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { RhythmObserver } from "./components/rhythm-observer";
import { RhythmControls } from "./components/rhythm-controls";
import { RhythmActions } from "./components/rhythm-actions";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { useSaveRhythm } from "./actions";
export type { RhythmGroove } from "./actions";

export default {
  description:
    "Sonata Section: per-song rhythm circle. A left-hand (bass) and right-hand (chords) onset necklace that spins with the playhead, persists per song, and feeds the song document's score pipeline as a per-song setting (SonataDocument.SongSetting) settled by a headless observer. Shown only for songs whose chords the song document voices: a symbol source (authored chords), or chord mode on.",
  contributions: [
    SonataDocument.SongSetting({
      id: "rhythm-sync",
      setting: grooveSetting,
      component: RhythmObserver,
    }),
    Sonata.Section({
      id: "rhythm",
      label: "Rhythm",
      icon: symbol("graphic-eq"),
      component: RhythmControls,
      area: "player",
      actions: RhythmActions,
      useAvailable: useHasVoicedChords,
    }),
  ],
} satisfies PluginDefinition;
