import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataPlayer } from "./slots";

export { SonataPlayer } from "./slots";
export { SonataPlayerScope } from "./scope";
export { usePlayerView, type PlayerView } from "./view";
export {
  PlayerDisplay,
  PlayerTransport,
  PlayToggle,
  PlayerTime,
} from "./components/parts";

export default {
  description:
    "Sonata player: SonataPlayerScope, the one composition root of a player (cursor store > song document > playback session > player view, with the per-session effects and a library song's setting observers), and the parts a host composes inside it — PlayerDisplay, PlayerTransport, PlayToggle, PlayerTime. Owns the SonataPlayer.{Display,Transport,Effect} slots — Effect mounting once per player while a PlayerDisplay shows it (the keyboard transport) — and the per-player view state (display lens, piano-roll spread, shown).",
  slots: { ...SonataPlayer },
} satisfies PluginDefinition;
