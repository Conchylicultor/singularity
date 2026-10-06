import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { UgAlignmentRowSchema } from "./row";

/**
 * One song's alignment row, or `null` when it has never had a video. Read by
 * the UG source's `hydrate`, so an aligned song opens aligned.
 */
export const getUgAlignment = defineEndpoint({
  route: "GET /api/sonata/songs/:id/ultimate-guitar/alignment",
  response: UgAlignmentRowSchema.nullable(),
});

/**
 * Set the song's recording from a pasted YouTube link (or a bare id) and start
 * aligning to it. 400 when the text is not a YouTube video.
 */
export const setUgAlignmentVideo = defineEndpoint({
  route: "PUT /api/sonata/songs/:id/ultimate-guitar/alignment/video",
  body: z.object({ url: z.string() }),
  response: z.object({ videoId: z.string() }),
});

/** Align the song again to its current video (after a failure, or on demand). */
export const realignUg = defineEndpoint({
  route: "POST /api/sonata/songs/:id/ultimate-guitar/alignment/realign",
  response: z.object({ ok: z.literal(true) }),
});
