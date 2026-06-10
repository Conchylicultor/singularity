import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * One song's persisted MIDI data, stored in the `sonata_songs_ext_midi`
 * entity-extension table owned by this source plugin (1:1 with `sonata_songs`,
 * FK CASCADE on song delete). `attachmentId` points at the stored `.mid` bytes;
 * `trackCount` is the file-derived note-bearing track count shown on the card.
 * `sourcePath` is the absolute path of the watched-folder file (null for manual
 * imports); `sourceMissing` flags a folder-imported file that vanished from disk.
 */
export const SongMidiRowSchema = z.object({
  songId: z.string(),
  attachmentId: z.string(),
  trackCount: z.number(),
  sourcePath: z.string().nullable(),
  sourceMissing: z.boolean(),
});
export type SongMidiRow = z.infer<typeof SongMidiRowSchema>;

/** Reactive list of every song's MIDI data (push resource; powers card meta). */
export const songMidiResource = resourceDescriptor<SongMidiRow[]>(
  "sonata-song-midi",
  z.array(SongMidiRowSchema),
  [],
);
