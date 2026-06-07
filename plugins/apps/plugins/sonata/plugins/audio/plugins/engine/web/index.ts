import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdVolumeUp } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { AudioPanel } from "./components/audio-panel";

export default {
  name: "Sonata: Audio Engine",
  description:
    "Sonata audio engine: schedules the Score's notes against the Web Audio clock on play, routing each note to its track's resolved instrument, with master volume and aggregate load status.",
  contributions: [
    Sonata.Section({
      id: "audio",
      label: "Audio",
      icon: MdVolumeUp,
      component: AudioPanel,
      area: "player",
    }),
  ],
} satisfies PluginDefinition;
