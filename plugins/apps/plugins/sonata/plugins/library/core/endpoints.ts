import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { SongSchema } from "./schemas";

/**
 * Create a song from an already-uploaded MIDI attachment. The client uploads
 * the MIDI first (gets an attachment id), then POSTs the extracted metadata.
 * A `response` schema is declared so `fetchEndpoint` returns the created Song
 * (the library opens it immediately after import).
 */
export const CreateSongBodySchema = z.object({
  title: z.string(),
  composer: z.string().nullable(),
  attachmentId: z.string(),
  durationSec: z.number(),
  endBeat: z.number(),
  midiTrackCount: z.number(),
});
export type CreateSongBody = z.infer<typeof CreateSongBodySchema>;

export const createSong = defineEndpoint({
  route: "POST /api/sonata/songs",
  body: CreateSongBodySchema,
  response: SongSchema,
});

export const deleteSong = defineEndpoint({
  route: "DELETE /api/sonata/songs/:id",
});
