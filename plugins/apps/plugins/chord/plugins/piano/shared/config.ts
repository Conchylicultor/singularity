import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { MAX_VOLUME } from "../core";

const volume = (label: string, description: string, fallback: number) =>
  intField({
    label,
    description,
    min: 0,
    max: MAX_VOLUME,
    step: 1,
    default: fallback,
  });

/**
 * What the loop is heard with: the song and the piano, each on or off at its
 * own level (`core/sound-mix.ts`). Four flat fields rather than one object, so
 * each shows as its own row in Settings → Config and each control on screen
 * writes only its own.
 */
export const chordSoundConfig = defineConfig({
  fields: {
    songOn: boolField({
      label: "Song on",
      description:
        "Hear the recording. Off mutes it without pausing it: the video keeps playing, and the piano keeps following it.",
      default: true,
    }),
    songVolume: volume("Song volume", "The recording's level, 0–100.", 100),
    pianoOn: boolField({
      label: "Piano on",
      description:
        "Play each chord of the loop on the app's piano as the song reaches it, so the chords can be heard on their own (with the song off) or under the record (with it on).",
      default: false,
    }),
    pianoVolume: volume(
      "Piano volume",
      "The piano's level, 0–100: the chords following the song, and every chord or key you play yourself.",
      80,
    ),
  },
});
