import { z } from "zod";
import { sectionFromHookpadDoc, type TheorytabSection } from "../../core";

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
 * Decode one section out of its envelope: `jsonData` from a string into a
 * value, then `sectionFromHookpadDoc`. A `jsonData` that is not JSON, or not a
 * Hookpad document of the expected shape, throws naming the section.
 */
export function sectionFromEnvelope(
  id: string,
  envelope: PublicSongEnvelope,
): TheorytabSection {
  let doc: unknown;
  try {
    doc = JSON.parse(envelope.jsonData);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new Error(
      `TheoryTab section ${id}: jsonData is not valid JSON (${err.message})`,
    );
  }
  return sectionFromHookpadDoc(id, envelope.song, doc);
}
