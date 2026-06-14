import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata, SonataToolbar } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { AudioEngine } from "./components/audio-engine";
import { AudioProvider } from "./components/audio-provider";
import { VolumeControl } from "./components/volume-control";

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
