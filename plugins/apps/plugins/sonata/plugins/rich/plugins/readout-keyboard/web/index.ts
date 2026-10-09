import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useReadoutPlane,
  ReadoutKeyboard,
  KeyboardCaption,
} from "./components/readout-keyboard";

// No contributions: a building block the rich sections (current chord, chord
// list, current key) compose, so every readout keyboard has one shape — the
// two-octave window, proportional keys, Sonata's skin, the same caption row.
export default {
  description:
    "Sonata readout keyboard: useReadoutPlane (voicings octave-fitted into the two-octave readout window, laid in the active pitch layout), ReadoutKeyboard (proportional keys in Sonata's skin) and KeyboardCaption (lead · trail caption row, trail accented when current).",
  contributions: [],
} satisfies PluginDefinition;
