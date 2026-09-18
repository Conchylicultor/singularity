import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { trainerPane } from "./panes";

export default {
  description:
    "The Chord trainer screen, the app's index pane (/chord): a real song's loop in an embedded YouTube player, an answer strip with one box per chord on the beat grid, one button per unlocked chord (keys 1–7), the check with its score, replays of the song over a box and of chords on Sonata's piano, the saved round, the player's playback reports, and the progress panel (today, all time, your chords).",
  contributions: [Pane.Register({ pane: trainerPane })],
  slots: { "chord-trainer": trainerPane },
} satisfies PluginDefinition;
