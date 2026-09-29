import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";

import { appIcon } from "@plugins/apps-core/plugins/app-icon/core";
import { sonataApp } from "../core";
import { SonataLayout } from "./components/sonata-layout";
import { Sonata } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { Sonata, SonataSectionItem } from "./slots";
export type { SonataSection } from "./slots";
export {
  useSonata,
  SonataProvider,
  TEMPO_MATH_FLOOR,
  type SonataContextValue,
  type TransportClock,
  type LoopRange,
  type CountInState,
} from "./context";
export {
  CursorStoreProvider,
  cursorApiFor,
  useCursorApi,
  useCursorBeat,
  useCursorSelector,
  type CursorApi,
  type CursorStore,
} from "./cursor-store";
export {
  defineSongSetting,
  type SongSetting,
  type SongSettingFailure,
  type SongSettingKey,
} from "./song-setting";
export {
  useSongSetting,
  useWriteSongSetting,
  useFailSongSetting,
} from "./loaded-song";
export { useMountedSongId } from "./song-setting-mount";
export {
  transposeSetting,
  keyAutoDetectSetting,
  chordModeSetting,
  grooveSetting,
  type RhythmGroove,
} from "./score-settings";
export {
  LaneInsetsProvider,
  useLaneInsets,
  type LaneInsets,
} from "./lane-insets";
export {
  useHasChords,
  useHasDerivedChord,
  useHasVoicedChords,
} from "./score-gates";

export default {
  description:
    "App shell for Sonata. Registers the /sonata app entry, owns SonataContext + transport, and defines the Sonata.{Source,Display,Analyzer,Overlay,Transport,Section} slots.",
  contributions: [
    Apps.App({
      app: sonataApp,
      icon: appIcon(symbol("piano")),
      component: SonataLayout,
    }),
  ],
  slots: { ...Sonata },
} satisfies PluginDefinition;
