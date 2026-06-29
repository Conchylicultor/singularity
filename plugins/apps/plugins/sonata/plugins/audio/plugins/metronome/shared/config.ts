import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";

// Metronome settings, shared by the web (read + write + register) and server
// (register) runtimes. All default to a quiet, opt-in click: the continuous
// track and the count-in are both OFF until the player enables them.
export const metronomeConfig = defineConfig({
  name: "sonata.metronome",
  fields: {
    // Click on every notated beat through the whole song (the classic metronome).
    continuous: boolField({
      label: "Metronome",
      description: "Play a click on every beat through the song.",
      default: false,
    }),
    // Lead-in length before playback starts: 0 = off, 1 or 2 bars.
    countInBars: intField({
      label: "Count-in",
      description:
        "Bars of metronome clicks before playback begins (0 = off, 1 or 2 bars).",
      default: 0,
      min: 0,
      max: 2,
      step: 1,
    }),
    // Click loudness, independent of the music master volume so a player can
    // mute the song and keep the click.
    volume: floatField({
      label: "Click volume",
      description: "Loudness of the metronome click (independent of the music).",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.01,
    }),
    // Accent the first beat of each bar (a brighter, louder click).
    accentDownbeat: boolField({
      label: "Accent downbeat",
      description: "Play a brighter, louder click on the first beat of each bar.",
      default: true,
    }),
  },
});
