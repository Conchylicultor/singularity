import { decodeHtmlText } from "@plugins/infra/plugins/html-decode/core";

// The school's course blurb, as plain text.
//
// It arrives as HTML pasted from wherever it was written — one live course
// carries an entire chat transcript's markup wrapped around three sentences of
// French. Tags out, entities decoded once, whitespace collapsed; what is left is
// the prose, which is the only part an event description wants.

/** Long enough for the whole blurb the school actually writes; a bound, not a style choice. */
const MAX_LENGTH = 1000;

const BLOCK_END = /<\/(p|div|section|li|h[1-6])\s*>|<br\s*\/?>/gi;
const TAG = /<[^>]*>/g;

export function courseDescription(
  html: string | undefined,
): string | undefined {
  if (html === undefined) return undefined;

  const text = decodeHtmlText(
    html
      // Block boundaries become paragraph breaks before the tags go, so two
      // sentences in separate <p>s do not fuse into one run-on line.
      .replace(BLOCK_END, "\n")
      .replace(TAG, ""),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");

  if (text === "") return undefined;
  return text.length <= MAX_LENGTH ? text : `${text.slice(0, MAX_LENGTH)}…`;
}
