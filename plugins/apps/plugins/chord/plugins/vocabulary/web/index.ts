import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ChordNumeral } from "./components/chord-numeral";
export { chordToneStyle } from "./chord-tone";

export default {
  description:
    "How a chord is drawn, wherever it is drawn: <ChordNumeral> (the Roman numeral in the display serif, its quality mark and inversion figure raised beside it) and chordToneStyle (the degree's colour and tile depth, as the --fn custom properties the .chord-tone paint reads). Shared by the trainer's boxes, buttons and chips and by the curriculum's locked next step, so one chord reads the same everywhere.",
  contributions: [],
} satisfies PluginDefinition;
