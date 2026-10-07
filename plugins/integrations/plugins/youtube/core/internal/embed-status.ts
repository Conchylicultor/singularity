import { z } from "zod";

// ── Whether a video plays in an embed ────────────────────────────────────────
//
// Two things can say: YouTube's oEmbed endpoint (asked from the server,
// `checkOembed`) and an IFrame player that tried the video (its `onError`
// code). Each answer is one of three statuses, or nothing at all — a code that
// says nothing about the video. Lifted from the chord trainer's video
// availability, which keeps its own ledger of these answers.

/** What one answer says about a video: it plays, it is gone, or it plays only on YouTube. */
export const EmbedStatusSchema = z.enum(["ok", "gone", "not-embeddable"]);
export type EmbedStatus = z.infer<typeof EmbedStatusSchema>;

/**
 * What one response code says about the video. `undecided` when the code says
 * nothing about availability (a server fault, throttling, a player glitch).
 */
export type CodeVerdict =
  { kind: "decided"; status: EmbedStatus } | { kind: "undecided" };

const decided = (status: EmbedStatus): CodeVerdict => ({
  kind: "decided",
  status,
});

/**
 * An oEmbed HTTP status, mapped. Every decided code was measured on 720 video
 * ids from the Hooktheory dump (2026-09-17/18), each 401 and 403 repeated
 * identically on three serial re-checks, so none of them is throttling:
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
 * A YouTube IFrame player `onError` code, mapped (the IFrame API reference).
 * Only a code that is a verdict on the VIDEO is decided:
 *
 * - 100 — the video was removed or is private.
 * - 101, 150 — the owner does not allow embedded playback (150 is 101 in
 *   disguise).
 *
 * Anything else says nothing about the video and is `undecided`: 2 is an
 * invalid parameter — the caller's bug (a malformed id, a seek sent before the
 * player could take it), never the video's fault — and 5 is an HTML5 player
 * fault. Counting either as a refusal would write a client glitch down as
 * permanent evidence against a video that plays fine.
 */
export function statusFromPlayerCode(code: number): CodeVerdict {
  switch (code) {
    case 100:
      return decided("gone");
    case 101:
    case 150:
      return decided("not-embeddable");
    default:
      return { kind: "undecided" };
  }
}
