import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { analyze } from "./analyze";

export default {
  name: "Sonata: Chord Analyzer",
  description:
    "Sonata Analyzer: derives chord annotations from the score's notes. Slices the score at every onset, runs interval-set chord detection over each window, and emits coalesced source:\"derived\" chord annotations.",
  contributions: [
    Sonata.Analyzer({
      id: "chord-analyzer",
      analyze,
    }),
  ],
} satisfies PluginDefinition;
