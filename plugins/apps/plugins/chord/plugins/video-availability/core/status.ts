import { z } from "zod";

// ── What we know about one video ─────────────────────────────────────────────
//
// Two sources observe a video: YouTube's oEmbed endpoint (asked on demand, see
// the server's check) and the trainer's own player (it reports what happened
// when it tried). Each observation is one of three decided answers; `unknown`
// is never observed — it is what the view resolves to when neither source has a
// fresh answer.

/** The resolved status of a video: an observed answer, or `unknown`. */
export const VideoStatusSchema = z.enum([
  "unknown",
  "ok",
  "gone",
  "not-embeddable",
]);
export type VideoStatus = z.infer<typeof VideoStatusSchema>;

/**
 * An answer a source actually gave: what the two nullable status columns hold.
 * `unknown` has no spelling there — no answer is a null.
 */
export const ObservedVideoStatusSchema = VideoStatusSchema.exclude(["unknown"]);
export type ObservedVideoStatus = z.infer<typeof ObservedVideoStatusSchema>;

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

/**
 * What one response code says about the video. `undecided` when the code says
 * nothing about availability (a server fault, throttling, a player glitch):
 * the code is still recorded, but the video stays `unknown`.
 */
export type CodeVerdict =
  { kind: "decided"; status: ObservedVideoStatus } | { kind: "undecided" };

const decided = (status: ObservedVideoStatus): CodeVerdict => ({
  kind: "decided",
  status,
});

/**
 * An oEmbed HTTP status, mapped. Every decided code was measured on 720 video
 * ids from the dump (2026-09-17/18), each 401 and 403 repeated identically on
 * three serial re-checks, so none of them is throttling:
 *
 * - 200 — the video is there.
 * - 404 — removed or private.
 * - 400 — the "id" is not a video id at all (a transcriber typed a word that
 *   happens to be eleven URL-safe characters). Nothing will ever play there.
 * - 403 — sign-in required or age-restricted: cannot play in an embed.
 * - 401 — the owner disabled embedding.
 */
export function statusFromOembedCode(code: number): CodeVerdict {
  switch (code) {
    case 200:
      return decided("ok");
    case 400:
    case 404:
      return decided("gone");
    case 401:
    case 403:
      return decided("not-embeddable");
    default:
      return { kind: "undecided" };
  }
}

/**
 * A YouTube IFrame player `onError` code, mapped (the IFrame API reference):
 *
 * - 100 — the video was removed or is private.
 * - 2 — the video id is malformed.
 * - 101, 150 — the owner does not allow embedded playback (150 is 101 in
 *   disguise).
 *
 * Anything else — 5, an HTML5 player fault — says nothing about the video.
 */
export function statusFromPlayerCode(code: number): CodeVerdict {
  switch (code) {
    case 2:
    case 100:
      return decided("gone");
    case 101:
    case 150:
      return decided("not-embeddable");
    default:
      return { kind: "undecided" };
  }
}
