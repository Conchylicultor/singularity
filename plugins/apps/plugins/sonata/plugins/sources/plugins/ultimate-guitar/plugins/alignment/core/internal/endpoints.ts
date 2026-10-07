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
 * aligning to it: the user's pick (`pick: "user"`), which nothing automatic
 * overrides. Picking one of the resolver's candidates is this call with its id.
 * 400 when the text is not a YouTube video.
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

/**
 * Find a video for the song automatically ("Find a video"): forget the current
 * video and candidates, search again, and align the best candidates in turn
 * until one aligns well enough (`pick: "auto"`).
 */
export const resolveUgAlignment = defineEndpoint({
  route: "POST /api/sonata/songs/:id/ultimate-guitar/alignment/resolve",
  response: z.object({ ok: z.literal(true) }),
});

/**
 * The embedded player refused this video: `not-embeddable` (IFrame error
 * 101 / 150) marks the candidate `not-embeddable`, `gone` (removed or private)
 * marks it `failed`; when the resolver picked it, the pick moves on to the next
 * candidate. Idempotent — the same refusal again changes nothing. `resolving`
 * says whether a new pick was started.
 */
export const refuseUgAlignmentVideo = defineEndpoint({
  route: "POST /api/sonata/songs/:id/ultimate-guitar/alignment/video-refused",
  body: z.object({
    videoId: z.string(),
    status: z.enum(["gone", "not-embeddable"]),
  }),
  response: z.object({ resolving: z.boolean() }),
});
