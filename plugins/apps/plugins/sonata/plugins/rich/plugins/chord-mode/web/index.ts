import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  chordModeSetting,
  SonataDocument,
} from "@plugins/apps/plugins/sonata/plugins/document/web";
import { ChordModeObserver } from "./components/chord-mode-observer";

export { useSaveChordMode } from "./actions";
export { ChordModeRow } from "./components/chord-mode-row";
export { useChordModeAvailable } from "./use-available";

export default {
  description:
    "Sonata accompaniment part: per-song chord mode. Exports the 'Play the detected chords' switch row (ChordModeRow) and its gate (useChordModeAvailable) for the Accompaniment section to compose: on, the song document voices the song's detected chords onto the Chords / Bass tracks (same voicing + rhythm options as a chord grid) and the original tracks are turned off in the Tracks card, where any of them can be re-enabled. Persists per song and registers with the song document's score pipeline as a per-song setting (SonataDocument.SongSetting) settled by a headless observer.",
  contributions: [
    SonataDocument.SongSetting({
      id: "chord-mode-sync",
      setting: chordModeSetting,
      component: ChordModeObserver,
    }),
  ],
} satisfies PluginDefinition;
