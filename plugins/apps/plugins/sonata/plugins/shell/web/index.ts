import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Apps } from "@plugins/apps/web";
import { MdPiano } from "react-icons/md";
import { SonataLayout } from "./components/sonata-layout";

export { Sonata, SonataToolbar } from "./slots";
export type { InstrumentVoices, ScheduledNote } from "./slots";
export {
  useSonata,
  SonataProvider,
  TEMPO_MATH_FLOOR,
  type SonataContextValue,
  type TransportClock,
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

export default {
  description:
    "App shell for Sonata. Registers the /sonata app entry, owns SonataContext + transport, and defines the Sonata.{Source,Display,Analyzer,Overlay,Instrument,Transport,Section} slots.",
  contributions: [
    Apps.App({
      id: "sonata",
      icon: MdPiano,
      tooltip: "Sonata",
      component: SonataLayout,
      path: "/sonata",
    }),
  ],
} satisfies PluginDefinition;
