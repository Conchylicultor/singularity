import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { CHORD_SOUND_SOURCES, type ChordSoundSource } from "../core";

/**
 * What each value means, spelled for Settings → Config. A `Record` over the
 * union rather than a list beside it: a third sound is then a tsc error here,
 * not a value that quietly arrives in the picker with no label.
 */
const SOURCE_LABEL: Record<ChordSoundSource, string> = {
  song: "The song",
  piano: "The piano",
};

export const chordSoundConfig = defineConfig({
  fields: {
    source: enumField({
      label: "Hear chords as",
      description:
        "What a chord of the loop plays when you click its box after the check: the bars of the song where it sounds, or the same chord struck alone on the app's piano. The chord buttons and the piano's own keys always sound on the piano — a chord the loop does not contain has no stretch of song to play.",
      options: CHORD_SOUND_SOURCES.map((value) => ({
        value,
        label: SOURCE_LABEL[value],
      })),
      default: "song",
    }),
  },
});
