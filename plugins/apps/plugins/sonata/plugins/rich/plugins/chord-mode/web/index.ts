import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  chordModeSetting,
  SonataDocument,
} from "@plugins/apps/plugins/sonata/plugins/document/web";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ChordModeObserver } from "./components/chord-mode-observer";
import { ChordModeActions } from "./components/chord-mode-actions";
import { useChordModeAvailable } from "./use-available";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { useSaveChordMode } from "./actions";

export default {
  description:
    "Sonata Section: per-song chord mode. One On/Off chip in the 'Chords' card header: on, the song document voices the song's detected chords onto the Chords / Bass tracks (same voicing + rhythm options as a chord grid) and the original tracks are turned off in the Tracks card, where any of them can be re-enabled. Persists per song and registers with the song document's score pipeline as a per-song setting (SonataDocument.SongSetting) settled by a headless observer.",
  contributions: [
    SonataDocument.SongSetting({
      id: "chord-mode-sync",
      setting: chordModeSetting,
      component: ChordModeObserver,
    }),
    Sonata.Section({
      id: "chord-mode",
      label: "Chords",
      icon: symbol("library-music"),
      area: "player",
      actions: ChordModeActions,
      useAvailable: useChordModeAvailable,
    }),
  ],
} satisfies PluginDefinition;
