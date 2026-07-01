import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

/**
 * Notation display options.
 *
 *  - `staffLayout` — how tracks map onto staves: `auto` (grand staff for a
 *    single track, one staff/grand-staff per track for many), `grand` (merge
 *    all tracks onto a treble/bass grand staff), or `perTrack` (one bracketed
 *    staff or grand staff per track).
 *  - `separateVoices` — partition each staff into independent voices with
 *    opposed stems (SATB-style); a held note under a moving line stays put
 *    instead of being re-struck. Off reproduces the v1 single-voice-per-staff
 *    look.
 *  - `splitPitch` — the MIDI pitch at/above which a note is engraved on the
 *    treble staff of a grand staff; below it goes to the bass staff. Default 60
 *    (middle C).
 *  - `showChordSymbols` — print each measure's chord symbol above the top staff
 *    (from the score's `chord` annotations), so the staff reads as a lead sheet.
 */
export const notationConfig = defineConfig({
  fields: {
    staffLayout: enumField({
      label: "Staff layout",
      description:
        "How tracks map onto staves: auto, a merged grand staff, or one staff per track.",
      options: [
        { value: "auto", label: "Auto" },
        { value: "grand", label: "Grand staff" },
        { value: "perTrack", label: "Per track" },
      ],
      default: "auto",
      display: "radio",
    }),
    separateVoices: boolField({
      label: "Separate voices",
      description:
        "Split each staff into independent voices (stems up/down); held notes stay put.",
      default: true,
    }),
    showChordSymbols: boolField({
      label: "Chord symbols",
      description: "Print chord symbols above the staff when the score has them.",
      default: true,
    }),
    splitPitch: intField({
      label: "Treble / bass split",
      description:
        "MIDI pitch at or above which notes go to the treble staff (60 = middle C).",
      default: 60,
      min: 21,
      max: 108,
      step: 1,
    }),
  },
});
