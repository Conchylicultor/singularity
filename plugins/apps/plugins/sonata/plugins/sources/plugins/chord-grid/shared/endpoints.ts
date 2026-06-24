import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * Create a chord-grid–backed song. Unlike MIDI (an imported, immutable file),
 * the chord grid is authored text, so the client sends the grid fields plus the
 * `compile()`-derived metrics. The handler writes the generic `sonata_songs`
 * row (via the library's `createSongRow`) and this source's
 * `sonata_songs_ext_chord_grid` row. Returns enough to open the song immediately.
 */
export const CreateChordGridSongBodySchema = z.object({
  title: z.string(),
  composer: z.string().nullable(),
  chordText: z.string(),
  durationSec: z.number(),
  endBeat: z.number(),
});
export type CreateChordGridSongBody = z.infer<
  typeof CreateChordGridSongBodySchema
>;

export const createChordGridSong = defineEndpoint({
  route: "POST /api/sonata/songs/chord-grid",
  body: CreateChordGridSongBodySchema,
  response: z.object({ id: z.string(), title: z.string() }),
});

/**
 * Fetch one song's chord-grid data (or `null` if the song carries none). Used by
 * the source's `hydrate` to repopulate the editor + recompile the score on open.
 */
export const getSongChordGrid = defineEndpoint({
  route: "GET /api/sonata/songs/:id/chord-grid",
  response: z
    .object({
      chordText: z.string(),
    })
    .nullable(),
});

/**
 * Persist an edit to a chord-grid song. Carries the full current snapshot — the
 * grid fields (→ extension row) plus the recomputed `title`/`durationSec`/
 * `endBeat` (→ parent song row via `updateSongMeta`), since `compile()` runs
 * client-side. Idempotent: each save writes a complete state, not a delta.
 */
export const UpdateChordGridSongBodySchema = z.object({
  title: z.string(),
  chordText: z.string(),
  durationSec: z.number(),
  endBeat: z.number(),
});
export type UpdateChordGridSongBody = z.infer<
  typeof UpdateChordGridSongBodySchema
>;

export const updateChordGridSong = defineEndpoint({
  route: "PUT /api/sonata/songs/:id/chord-grid",
  body: UpdateChordGridSongBodySchema,
  response: z.object({ ok: z.literal(true) }),
});
