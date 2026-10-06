import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataSession } from "./slots";

export { SonataSession } from "./slots";
export {
  PlaybackSession,
  useSession,
  TEMPO_MATH_FLOOR,
  type SessionContent,
  type SessionValue,
  type TransportClock,
  type LoopRange,
  type CountInState,
} from "./session";
export {
  CursorStoreProvider,
  cursorApiFor,
  useCursorApi,
  useCursorSelector,
  type CursorApi,
  type CursorStore,
} from "./cursor-store";

export default {
  description:
    "Sonata playback session: plays a song's composed content — the tempo-scaled score, the rAF transport over a per-surface cursor store, the A–B loop, the count-in, seek / scrub verbs and the play- and seek-on-load intents. Mountable by any host (useSession); defines the per-session SonataSession.{Provider,Effect} slots the audio plugins contribute to.",
  slots: { ...SonataSession },
} satisfies PluginDefinition;
