import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RhythmPatternSchema } from "./resources";

/**
 * Set a song's rhythm groove: the `enabled` flag plus both hands' patterns.
 * Upserts the per-song extension row. The body is validated by
 * `RhythmPatternSchema` (onsets in range), so a malformed pattern is rejected
 * loudly rather than persisted.
 */
export const setRhythmEndpoint = defineEndpoint({
  route: "POST /api/sonata/songs/:id/rhythm",
  body: z.object({
    enabled: z.boolean(),
    bass: RhythmPatternSchema,
    chord: RhythmPatternSchema,
  }),
});
