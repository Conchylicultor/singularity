import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { chordSoundConfig } from "../shared/config";

export { usePiano } from "./internal/use-piano";
export {
  useChordSoundSource,
  useSetChordSoundSource,
} from "./internal/use-sound-source";
export { PianoCard } from "./components/piano-card";

export default {
  description:
    "The Chord app's piano: usePiano (one AudioContext and one voice set per screen, striking a chord or a single note on Sonata's default instrument), <PianoCard> — the four-octave keyboard drawing the chord on show, its doubled bass greyed beside it, playable key by key — and the sound toggle that decides whether a chord box plays the song or the piano.",
  contributions: [ConfigV2.WebRegister({ descriptor: chordSoundConfig })],
} satisfies PluginDefinition;
