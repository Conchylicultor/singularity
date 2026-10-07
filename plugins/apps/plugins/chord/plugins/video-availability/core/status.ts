import { z } from "zod";
import { EmbedStatusSchema } from "@plugins/integrations/plugins/youtube/core";

// ── What we know about one video ─────────────────────────────────────────────
//
// Two sources observe a video: YouTube's oEmbed endpoint (asked on demand, see
// the server's check) and the trainer's own player (it reports what happened
// when it tried). Each observation is one of the three decided answers of
// `EmbedStatus` (`integrations/youtube`, which also maps a code to one);
// `unknown` is never observed — it is what the view resolves to when neither
// source has a fresh answer.

/** The resolved status of a video: an observed answer, or `unknown`. */
export const VideoStatusSchema = z.enum([
  "unknown",
  ...EmbedStatusSchema.options,
]);
export type VideoStatus = z.infer<typeof VideoStatusSchema>;

/** The statuses a loop must never be offered on. */
export const UNPLAYABLE_STATUSES = [
  "gone",
  "not-embeddable",
] as const satisfies readonly VideoStatus[];

/**
 * How long an observation counts. Older evidence counts as none, so the video
 * is checked again the next time a loop on it is offered — the only way a
 * re-check ever happens, since nothing sweeps.
 */
export const EVIDENCE_TTL_DAYS = 90;
