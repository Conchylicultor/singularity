import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

/**
 * Chord grid display options.
 *
 *  - `lyrics` — print the songsheet lines sung in each row of bars under it,
 *    chords over the words, each line starting under the bar it is sung in.
 *    Off by default: the grid stays chords only.
 */
export const chordChartConfig = defineConfig({
  fields: {
    lyrics: boolField({
      label: "Lyrics under bars",
      description:
        "Print the lyric lines sung in each row of bars under it, with their chords.",
      default: false,
    }),
  },
});
