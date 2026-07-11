import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SonataAudio } from "./slots";
export type { InstrumentVoices, ScheduledNote } from "./slots";

export default {
  description:
    "Sonata audio Instrument axis: the SonataAudio.Instrument slot and its voice contracts (InstrumentVoices, ScheduledNote) — an audio contract a host with an AudioContext can consume without importing the Sonata app shell.",
  contributions: [],
} satisfies PluginDefinition;
