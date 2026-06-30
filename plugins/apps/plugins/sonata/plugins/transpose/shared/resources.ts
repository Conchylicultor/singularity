import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * One song's global transpose offset, in semitones. The player shifts the whole
 * song (notes, voiced chords, chord labels, songsheet chord text, displayed key)
 * by this amount — see the `transpose` plugin's observer, which feeds it into the
 * shell's score pipeline. Stored in the `sonata_songs_ext_transpose`
 * entity-extension table (1:1 per song; an absent row reads as `0`).
 */
export const TransposeRowSchema = z.object({
  songId: z.string(),
  semitones: z.number().int(),
});
export type TransposeRow = z.infer<typeof TransposeRowSchema>;

/** Reactive list of every song's transpose offset (push resource). */
export const transposeResource = resourceDescriptor<TransposeRow[]>(
  "sonata-transpose",
  z.array(TransposeRowSchema),
  [],
);
