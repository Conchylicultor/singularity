import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { AudioEngine } from "./components/audio-engine";
import { VolumeControl } from "./components/volume-control";

export default {
  description:
    "Sonata audio engine: schedules the Score's notes against the Web Audio clock on play, routing each note to its track's resolved instrument, with master volume in the top toolbar.",
  contributions: [
    // The Web Audio graph lives in a headless, always-mounted effect so the
    // AudioContext survives the player's section column being collapsed.
    Sonata.Effect({ id: "audio-engine", component: AudioEngine }),
    // The master-volume slider, pinned into the top toolbar; owns no audio.
    Sonata.Toolbar({ id: "volume", component: VolumeControl }),
  ],
} satisfies PluginDefinition;
