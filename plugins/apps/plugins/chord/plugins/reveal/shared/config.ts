import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { REVEAL_MODES, type RevealMode } from "../core";

/**
 * What each value shows, spelled for Settings → Config. A `Record` over the
 * union rather than a list beside it: a fourth reveal mode is then a tsc error
 * here, not a value that quietly arrives in the picker with no label.
 */
const REVEAL_LABEL: Record<RevealMode, string> = {
  off: "Off",
  names: "Chord names",
  keyboard: "Chord names and keyboard",
};

export const revealConfig = defineConfig({
  fields: {
    mode: enumField({
      label: "Reveal",
      description:
        "How much the Chord trainer shows of each chord besides its Roman numeral. Names adds the chord's letter name in the song's key, on the boxes and the buttons, and the key on the song card. Keyboard adds a piano under the buttons lighting exactly the notes the app plays for the chord being heard. Nothing is shown until the round is checked.",
      options: REVEAL_MODES.map((value) => ({
        value,
        label: REVEAL_LABEL[value],
      })),
      default: "off",
    }),
  },
});
