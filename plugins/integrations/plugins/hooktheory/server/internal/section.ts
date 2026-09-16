import { z } from "zod";
import { TheorytabSectionSchema, type TheorytabSection } from "../../core";
import { youtubeVideoId } from "./youtube";
import { parseOrThrow } from "./parse";

/**
 * What `GET /songs/public/<id>?fields=ID,song,jsonData` answers. `jsonData` is
 * the Hookpad document serialized a SECOND time, as a string inside the JSON.
 * (`ID` is Hooktheory's numeric id for the section; `xmlData`, which some
 * responses include as `null` although it was not asked for, is dropped.)
 */
export const PublicSongEnvelopeSchema = z.object({
  ID: z.number(),
  song: z.string(),
  jsonData: z.string(),
});
export type PublicSongEnvelope = z.infer<typeof PublicSongEnvelopeSchema>;

/**
 * The Hookpad document as stored: the section's own fields, with YouTube as
 * Hookpad keeps it (`id` is whatever the transcriber pasted). zod strips the
 * editor state around them.
 */
const HookpadDocSchema = TheorytabSectionSchema.pick({
  chords: true,
  notes: true,
  keys: true,
  tempos: true,
  meters: true,
  endBeat: true,
}).extend({
  youtube: z.object({
    id: z.string(),
    syncStart: z.number(),
    syncEnd: z.number(),
  }),
});

/**
 * Decode one section out of its envelope. A `jsonData` that is not JSON, or not
 * a Hookpad document of the expected shape, throws naming the section — never a
 * section with parts missing.
 */
export function sectionFromEnvelope(
  id: string,
  envelope: PublicSongEnvelope,
): TheorytabSection {
  let raw: unknown;
  try {
    raw = JSON.parse(envelope.jsonData);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new Error(
      `TheoryTab section ${id}: jsonData is not valid JSON (${err.message})`,
    );
  }
  const doc = parseOrThrow(
    HookpadDocSchema,
    raw,
    `TheoryTab section ${id} jsonData`,
  );
  return {
    id,
    song: envelope.song,
    chords: doc.chords,
    notes: doc.notes,
    keys: doc.keys,
    tempos: doc.tempos,
    meters: doc.meters,
    endBeat: doc.endBeat,
    youtube: {
      rawId: doc.youtube.id,
      videoId: youtubeVideoId(doc.youtube.id),
      syncStart: doc.youtube.syncStart,
      syncEnd: doc.youtube.syncEnd,
    },
  };
}
