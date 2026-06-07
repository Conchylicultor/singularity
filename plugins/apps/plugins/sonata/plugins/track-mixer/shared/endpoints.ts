import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * Partial-patch upsert of one track's view override. Only the provided fields
 * are written; omitted fields keep their prior value (or the column default on
 * first insert). `color: null` explicitly clears a custom color back to the
 * palette default; `instrument: null` clears the override back to "auto".
 */
export const upsertTrackView = defineEndpoint({
  route: "POST /api/sonata/songs/:songId/track-view",
  body: z.object({
    trackId: z.string(),
    color: z.string().nullable().optional(),
    instrument: z.string().nullable().optional(),
    muted: z.boolean().optional(),
    hidden: z.boolean().optional(),
  }),
});

/** Reset a song to defaults by deleting all its persisted track overrides. */
export const resetTrackView = defineEndpoint({
  route: "DELETE /api/sonata/songs/:songId/track-view",
});
