import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ChordNumeral } from "./components/chord-numeral";
export { chordToneStyle } from "./chord-tone";
export { chordPaint } from "./chord-paint";
export type { ChordPaint } from "./chord-paint";

export default {
  description:
    "How a chord is drawn, wherever it is drawn: <ChordNumeral> (the Roman numeral in the display serif, its quality mark and inversion figure raised beside it) and chordToneStyle (the degree's colour and tile depth, as the --fn custom properties the .chord-tone paint reads), and chordPaint — the four named paints (tile, tint, tint-quiet, ghost) every chord surface applies by name instead of re-stating a chord colour, with .chord-caption for a reading under a numeral (V/V, I/3) in the paint's own ink. Shared by the trainer's boxes, buttons and chips and by the curriculum's Chords section (its chips), so one chord reads the same everywhere.",
  contributions: [],
} satisfies PluginDefinition;
