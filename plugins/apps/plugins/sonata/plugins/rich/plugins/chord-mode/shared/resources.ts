import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * One song's chord mode. When `enabled`, the player voices the song's detected
 * (analyzer-derived) chords onto the Chords / Bass tracks — see the `chord-mode`
 * plugin's observer, which feeds this into the shell's score pipeline — and the
 * original tracks were turned off in the Tracks card on the way in. Stored in
 * the `sonata_songs_ext_chord_mode` entity-extension table (1:1 per song; an
 * absent row reads as `false`).
 */
export const ChordModeRowSchema = z.object({
  songId: z.string(),
  enabled: z.boolean(),
});
export type ChordModeRow = z.infer<typeof ChordModeRowSchema>;

/** Reactive list of every song's chord-mode setting (push resource). */
export const chordModeResource = resourceDescriptor<ChordModeRow[]>(
  "sonata-chord-mode",
  z.array(ChordModeRowSchema),
  [],
);
