import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdVolumeUp } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { AudioEngine } from "./components/audio-engine";
import { AudioPanel } from "./components/audio-panel";

export default {
  name: "Sonata: Audio Engine",
  description:
    "Sonata audio engine: schedules the Score's notes against the Web Audio clock on play, routing each note to its track's resolved instrument, with master volume and aggregate load status.",
  contributions: [
    // The Web Audio graph lives in a headless, always-mounted effect so the
    // AudioContext survives the player's section column being collapsed.
    Sonata.Effect({ id: "audio-engine", component: AudioEngine }),
    // The visible volume slider + status line; collapsible, owns no audio.
    Sonata.Section({
      id: "audio",
      label: "Audio",
      icon: MdVolumeUp,
      component: AudioPanel,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
