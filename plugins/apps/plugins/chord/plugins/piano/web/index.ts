import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { chordSoundConfig } from "../shared/config";

export { usePiano, type Piano } from "./internal/use-piano";
export { useSoundMix } from "./internal/use-sound-mix";
export { PianoCard } from "./components/piano-card";
export { SoundChannelControl } from "./components/sound-channel";

export default {
  description:
    "The Chord app's piano: usePiano (one AudioContext and one voice set per screen, striking a chord or a single note on Sonata's default instrument), <PianoCard> — the four-octave keyboard drawing the chord on show, its doubled bass greyed beside it, playable key by key — and the sound mix: the song and the piano as two channels, each on or off at its own level (useSoundMix, <SoundChannelControl channel/>), the piano following the song's playhead when on.",
  contributions: [ConfigV2.WebRegister({ descriptor: chordSoundConfig })],
} satisfies PluginDefinition;
