import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdPiano } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { createVoices } from "./voices";

export default {
  id: "sonata-audio-piano",
  name: "Sonata: Acoustic Piano",
  description:
    "Sonata Instrument: a sampled acoustic grand piano (smplr SplendidGrandPiano) that sounds the Score during playback.",
  contributions: [
    Sonata.Instrument({
      id: "piano",
      label: "Acoustic Piano",
      icon: MdPiano,
      createVoices,
    }),
  ],
} satisfies PluginDefinition;
