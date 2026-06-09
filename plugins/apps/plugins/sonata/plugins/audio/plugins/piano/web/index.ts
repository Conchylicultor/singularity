import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdPiano } from "react-icons/md";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { createVoices } from "./voices";

export default {
  description:
    "Sonata Instrument: a sampled acoustic grand piano (smplr SplendidGrandPiano) that sounds the Score during playback.",
  contributions: [
    Sonata.Instrument({
      id: "piano",
      label: "Acoustic Piano",
      icon: MdPiano,
      // The premium sampled grand owns GM program 0 (acoustic grand piano) and
      // is the fallback for tracks with no program/override. The soundfont set
      // covers programs 1-127, so there is no program overlap.
      gmProgram: 0,
      group: "Piano",
      default: true,
      createVoices,
    }),
  ],
} satisfies PluginDefinition;
