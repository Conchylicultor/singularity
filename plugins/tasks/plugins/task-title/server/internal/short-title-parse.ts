// Pure half of short-title generation: which titles need no model call, and
// what counts as a usable model answer. No I/O, so it is unit-tested directly.

export const SHORT_TITLE_MAX_WORDS = 3;
// A three-word answer longer than this is not a short title (one run-on token,
// a URL, a path) — the full title reads better than a truncation of it.
const SHORT_TITLE_MAX_CHARS = 40;

export type ShortTitleResult =
  { ok: true; shortTitle: string } | { ok: false; reason: string };

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * A title that is already short is its own short title — no model call. Returns
 * the normalized title, or `undefined` when the title needs shortening.
 */
export function alreadyShort(title: string): string | undefined {
  const w = words(title);
  if (w.length === 0 || w.length > SHORT_TITLE_MAX_WORDS) return undefined;
  return w.join(" ");
}

// Wrapping quotes / backticks the model sometimes adds despite the prompt.
const WRAPPING = /^["'`“”‘’«»]+|["'`“”‘’«»]+$/g;

/**
 * Parse a model answer into a short title: the first non-empty line, wrapping
 * quotes and a trailing period stripped, whitespace collapsed. Valid only with
 * 1–3 words and at most 40 characters; anything else is a failure, and the
 * caller writes nothing (the full title keeps showing).
 */
export function parseShortTitle(raw: string): ShortTitleResult {
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (line === undefined) return { ok: false, reason: "empty output" };
  const cleaned = words(
    line
      .replace(WRAPPING, "")
      .trim()
      .replace(/[.。]+$/, ""),
  ).join(" ");
  const count = words(cleaned).length;
  if (count === 0) return { ok: false, reason: "empty output" };
  if (count > SHORT_TITLE_MAX_WORDS) {
    return { ok: false, reason: `${count} words: ${cleaned}` };
  }
  if (cleaned.length > SHORT_TITLE_MAX_CHARS) {
    return { ok: false, reason: `${cleaned.length} chars: ${cleaned}` };
  }
  return { ok: true, shortTitle: cleaned };
}
