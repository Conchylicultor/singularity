import { parseUiContext, UI_CONTEXT_RE, type UiContextMeta } from "./token";

/**
 * One run of a text that may hold `<ui-context>` tokens, in reading order.
 *
 * Three arms, because a match is not yet a token: `UI_CONTEXT_RE` recognizes
 * the tag's outline, and `parseUiContext` then refuses one with no `url` or no
 * element label (a tag typed by hand, or one truncated mid-paste). That refusal
 * is its own arm rather than folded into `text`, so each consumer decides what
 * an almost-token means to it — the chip draws it as the characters typed.
 */
export type UiContextSegment =
  | { kind: "text"; text: string }
  | { kind: "tag"; raw: string; meta: UiContextMeta }
  | { kind: "malformed"; raw: string };

/**
 * `text` cut into prose and `<ui-context>` tags, in order — for a consumer that
 * must treat the tokens differently from the words around them (rewrite each
 * into a readable label, carry the raw tag elsewhere) without naming the
 * token's pattern itself, which `no-token-identity-outside-owner` reserves to
 * the token's owners.
 *
 * Joining every segment's `text` / `raw` gives back `text` exactly. A `text`
 * segment is never empty: two adjacent tags have nothing between them.
 */
export function splitUiContext(text: string): UiContextSegment[] {
  const segments: UiContextSegment[] = [];
  let at = 0;
  // A fresh copy: the exported pattern is global, so its `lastIndex` is state
  // shared with every other caller.
  for (const match of text.matchAll(
    new RegExp(UI_CONTEXT_RE.source, UI_CONTEXT_RE.flags),
  )) {
    if (match.index > at) {
      segments.push({ kind: "text", text: text.slice(at, match.index) });
    }
    const raw = match[0];
    const meta = parseUiContext(raw);
    segments.push(
      meta ? { kind: "tag", raw, meta } : { kind: "malformed", raw },
    );
    at = match.index + raw.length;
  }
  if (at < text.length) segments.push({ kind: "text", text: text.slice(at) });
  return segments;
}
