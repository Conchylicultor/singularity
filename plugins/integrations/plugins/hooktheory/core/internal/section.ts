import { z } from "zod";
import { TheorytabSectionSchema, type TheorytabSection } from "./schemas";
import { parseOrThrow } from "./parse";
import { youtubeVideoId } from "./youtube";

/**
 * The harmony half of a Hookpad document: everything but the melody. zod strips
 * the editor state and `notes` around it. A reader that never looks at the
 * melody parses with this one, so a melody it does not read cannot refuse a
 * section — the one dump document with notes on a `null` beat (`pJkmZPEjxqn`)
 * reads here, while `HookpadDocSchema` refuses it.
 */
export const HookpadHarmonyDocSchema = TheorytabSectionSchema.pick({
  chords: true,
  keys: true,
  tempos: true,
  meters: true,
  endBeat: true,
}).extend({
  youtube: z.object({
    id: z.string().nullable(),
    syncStart: z.number(),
    syncEnd: z.number(),
  }),
});

/**
 * The Hookpad document as stored: the section's own fields, with YouTube as
 * Hookpad keeps it (`id` is whatever the transcriber pasted). zod strips the
 * editor state around them. The live API serves it as `jsonData`; the Sheet
 * Sage raw dump holds it as each entry's `json`.
 */
export const HookpadDocSchema = HookpadHarmonyDocSchema.extend({
  notes: TheorytabSectionSchema.shape.notes,
});

/**
 * Decode one section from its Hookpad document, already parsed from JSON. A
 * document that is not of the expected shape throws naming the section and the
 * offending fields — never a section with parts missing.
 */
export function sectionFromHookpadDoc(
  id: string,
  song: string,
  doc: unknown,
): TheorytabSection {
  const parsed = parseOrThrow(
    HookpadDocSchema,
    doc,
    `TheoryTab section ${id} document`,
  );
  return {
    id,
    song,
    chords: parsed.chords,
    notes: parsed.notes,
    keys: parsed.keys,
    tempos: parsed.tempos,
    meters: parsed.meters,
    endBeat: parsed.endBeat,
    youtube: {
      rawId: parsed.youtube.id,
      videoId:
        parsed.youtube.id === null ? null : youtubeVideoId(parsed.youtube.id),
      syncStart: parsed.youtube.syncStart,
      syncEnd: parsed.youtube.syncEnd,
    },
  };
}
