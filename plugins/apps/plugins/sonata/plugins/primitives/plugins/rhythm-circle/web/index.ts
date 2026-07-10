import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { RhythmCircle } from "./internal/rhythm-circle";
export type {
  RhythmCircleProps,
  RhythmCircleHandle,
  RhythmCircleTrack,
} from "./internal/rhythm-circle";

export default {
  description:
    "Generic rotating rhythm-necklace SVG: one concentric ring per track, a bead per pulse (index 0 at 12 o'clock, clockwise), filled beads for onsets, and a playhead needle. Imports nothing from Sonata — speaks only plain numbers. The spin is driven imperatively via setPhase(phase) and costs zero React renders; beads are optionally click-to-toggle.",
  contributions: [],
} satisfies PluginDefinition;
