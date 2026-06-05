import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * Create a song from an already-uploaded MIDI attachment. The client uploads the
 * MIDI first (gets an attachment id) and parses it for metadata, then POSTs.
 * The handler writes the generic `sonata_songs` row (via the library's
 * `createSongRow` helper) and this source's `sonata_songs_ext_midi` row, and
 * links the attachment. Returns enough to open the song immediately.
 */
export const CreateMidiSongBodySchema = z.object({
  title: z.string(),
  composer: z.string().nullable(),
  attachmentId: z.string(),
  durationSec: z.number(),
  endBeat: z.number(),
  trackCount: z.number(),
});
export type CreateMidiSongBody = z.infer<typeof CreateMidiSongBodySchema>;

export const createMidiSong = defineEndpoint({
  route: "POST /api/sonata/songs/midi",
  body: CreateMidiSongBodySchema,
  response: z.object({ id: z.string(), title: z.string() }),
});

/**
 * Fetch one song's MIDI data (or `null` if this song carries no MIDI). Used by
 * the source's `hydrate` to resolve the attachment to fetch — a one-shot read in
 * a non-hook context, complementing the reactive `songMidiResource` list.
 */
export const getSongMidi = defineEndpoint({
  route: "GET /api/sonata/songs/:id/midi",
  response: z
    .object({ attachmentId: z.string(), trackCount: z.number() })
    .nullable(),
});
