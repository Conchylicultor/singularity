import { z } from "zod";

/**
 * A persisted Sonata song: a stored MIDI file (attachment) plus the metadata
 * the library gallery needs to render a card and the player needs to hydrate
 * its timeline. `createdAt` is an ISO string (it crosses the wire as JSON; the
 * server maps the DB `Date` to `.toISOString()` in the resource loader).
 */
export const SongSchema = z.object({
  id: z.string(),
  title: z.string(),
  composer: z.string().nullable(),
  midiAttachmentId: z.string(),
  durationSec: z.number(),
  endBeat: z.number(),
  createdAt: z.string(),
});

export type Song = z.infer<typeof SongSchema>;
