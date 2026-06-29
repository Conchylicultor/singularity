import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata, SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { AudioEngine } from "./components/audio-engine";
import { AudioProvider } from "./components/audio-provider";
import { VolumeControl } from "./components/volume-control";

// Shared audio toolkit for sibling per-surface audio effects (the metronome):
// the live graph handle and the loop-/tempo-aware look-ahead scheduler. Reusing
// `startScheduling` gives clicks the same seamless A–B loop wrap and tempo-retime
// behaviour as note playback for free.
export { useAudioGraph, type AudioGraph } from "./audio-store";
export { startScheduling } from "./scheduler";
export type { LoopWindowBeats, ScheduleHandle } from "./scheduler";

export default {
  description:
    "Sonata audio engine: schedules the Score's notes against the Web Audio clock on play, routing each note to its track's resolved instrument, with master volume in the top toolbar.",
  contributions: [
    // Per-surface audio store, folded above the whole Sonata subtree so the
    // engine effect and the volume control (different slot branches) share one
    // store — and two open surfaces stay independent.
    Sonata.SurfaceProvider({ id: "audio", component: AudioProvider }),
    // The Web Audio graph lives in a headless, always-mounted effect so the
    // AudioContext survives the player's section column being collapsed.
    Sonata.Effect({ id: "audio-engine", component: AudioEngine }),
    // The master-volume slider, pinned into the top toolbar; owns no audio.
    SonataToolbar.End({ id: "volume", component: VolumeControl }),
  ],
} satisfies PluginDefinition;
