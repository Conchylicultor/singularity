import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { ChordNumeral } from "./components/chord-numeral";
export { chordToneStyle } from "./chord-tone";

export default {
  description:
    "A chord token drawn with the shared chord box (music/chord-box): <ChordNumeral token> (its Roman numeral, from chordLabel) and chordToneStyle(token) (its degree colour and tile depth, as the --fn custom properties the .chord-tone paint and the named chord paints read). Shared by the trainer's boxes, buttons and chips and by the curriculum's Chords section (its chips), so one chord reads the same everywhere.",
  contributions: [],
} satisfies PluginDefinition;
