import { matchBracket } from "./helpers";
import { maskSource } from "./mask-source";

export interface MarkerCall {
  /** Index of the marker identifier's first char in the ORIGINAL source. */
  index: number;
  /** Text between the call's `(` and balanced `)`, sliced from the ORIGINAL source. */
  argsText: string;
}

/** Byte offsets (into the scanned source) of one `marker[<…>](…)` call. */
export interface MarkerCallSpan {
  /** Index of the marker identifier's first char. */
  identifier: number;
  /** Index of the call's opening `(`. */
  open: number;
  /** Index of the matching closing `)`. */
  close: number;
}

/**
 * Find the byte span of every genuine `marker[<…>](…)` call in ALREADY-MASKED
 * source — the single `<…>`-tolerant call scanner every resource-shaped scanner
 * (`findMarkerCalls`, the `no-db-backed-notify` and `keyed-resource-scope`
 * checks, and any future one) routes through, so none of them can ever again
 * SILENTLY under-match the generic call form.
 *
 * The caller masks first (with whatever `maskSource` options it needs — strings
 * blanked or kept) and passes the masked text; because `maskSource` preserves
 * every offset 1:1, the returned indices map straight back to the original.
 *
 * Detection: `\b<marker>` then an OPTIONAL generic argument list then the call
 * `(`. The `<[^()]*?>` is a deliberately shallow generic skip — it stops at the
 * first `(`/`)`, which is correct because a type argument never contains a paren,
 * while a real `<` comparison is never immediately preceded by a marker token.
 * Tolerating `<…>` is what fixes the generic blind spot: `defineResource<T>(…)`
 * and `defineExternalResource<T, P>(…)` are matched exactly like the plain form.
 *
 * The leading `\b` plus the literal marker means a marker is never matched inside
 * a longer identifier — e.g. scanning for `defineResource` never hits
 * `defineExternalResource` (which is `define`+`External`+`Resource`, with no
 * `defineResource` substring). A `.`-member prefix (`h.runtime.defineResource(`)
 * still anchors via the `\b` after the `.`.
 *
 * The argument span is walked with `matchBracket`, which skips string/comment
 * interiors itself — so a stray `)` inside a string in the args can never throw
 * off the paren depth, whether or not the caller blanked strings. An unbalanced
 * call (no matching `)`) is skipped rather than emitted. `marker` is a plain
 * identifier; regex metacharacters in it are escaped.
 */
export function markerCallSpans(masked: string, marker: string): MarkerCallSpan[] {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\s*(?:<[^()]*?>)?\\s*\\(`, "g");
  const out: MarkerCallSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    // The matched slice ends ON the call's `(`.
    const open = m.index + m[0].length - 1;
    const close = matchBracket(masked, open, "(", ")");
    if (close < 0) continue;
    out.push({ identifier: m.index, open, close });
    // Resume past this call's closing paren so a nested marker call isn't
    // double-read.
    re.lastIndex = close + 1;
  }
  return out;
}

/**
 * Find every genuine `marker(…)` call in `src`, skipping occurrences that live
 * inside comments, strings or regex literals.
 *
 * Detection runs against a fully-masked copy (`{ strings: true }`) so a marker
 * name in a comment or string can never be picked up; the args text is sliced
 * from the ORIGINAL source (delimiters/values intact) so callers can parse it
 * with `parseStringField` / `parseBoolField`. The generic call form
 * (`marker<…>(…)`) is matched, via the shared `markerCallSpans` scanner.
 *
 * `marker` is a plain identifier (e.g. `"defineCollectedDir"`).
 */
export function findMarkerCalls(src: string, marker: string): MarkerCall[] {
  const masked = maskSource(src, { strings: true });
  return markerCallSpans(masked, marker).map((s) => ({
    index: s.identifier,
    argsText: src.slice(s.open + 1, s.close),
  }));
}

/** 1-based line number of byte offset `idx` in `src`. */
export function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) {
    if (src[i] === "\n") line++;
  }
  return line;
}
