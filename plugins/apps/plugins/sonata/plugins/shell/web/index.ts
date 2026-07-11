import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps-core/web";
import { MdPiano } from "react-icons/md";
import { mdAppIcon } from "@plugins/apps-core/plugins/app-icon/web";
import { sonataApp } from "../core";
import { SonataLayout } from "./components/sonata-layout";

export { Sonata, SonataToolbar } from "./slots";
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
  KeyModeStoreProvider,
  useKeyAutoDetect,
  useSetKeyAutoDetect,
} from "./key-mode-store";
export {
  TransposeStoreProvider,
  useTransposeSemitones,
  useSetTransposeSemitones,
} from "./transpose-store";
export {
  RhythmStoreProvider,
  useRhythmHands,
  useSetRhythmHands,
} from "./rhythm-store";
export {
  LaneInsetsProvider,
  useLaneInsets,
  type LaneInsets,
} from "./lane-insets";
export { useHasChords, useHasAuthoredChord } from "./score-gates";

export default {
  description:
    "App shell for Sonata. Registers the /sonata app entry, owns SonataContext + transport, and defines the Sonata.{Source,Display,Analyzer,Overlay,Transport,Section} slots.",
  contributions: [
    Apps.App({
      id: sonataApp.id,
      icon: mdAppIcon(MdPiano),
      tooltip: "Sonata",
      component: SonataLayout,
      path: sonataApp.basePath,
    }),
  ],
} satisfies PluginDefinition;
