import { matchBracket } from "./helpers";
import { maskSource } from "./mask-source";

export interface MarkerCall {
  /** Index of the marker identifier's first char in the ORIGINAL source. */
  index: number;
  /** Text between the call's `(` and balanced `)`, sliced from the ORIGINAL source. */
  argsText: string;
}

/**
 * Find every genuine `marker(…)` call in `src`, skipping occurrences that live
 * inside comments, strings or regex literals.
 *
 * The match is detected against a fully-masked copy (`{ strings: true }`) so a
 * marker name written in a comment or string can never be picked up. The args
 * text is sliced from the ORIGINAL source (delimiters/values intact) so callers
 * can parse it with `parseStringField` / `parseBoolField`.
 *
 * `marker` is a plain identifier (e.g. `"defineCollectedDir"`).
 */
export function findMarkerCalls(src: string, marker: string): MarkerCall[] {
  const masked = maskSource(src, { strings: true });
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\s*\\(`, "g");
  const out: MarkerCall[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    // The matched slice ends at the `(`; find its exact offset in the masked text
    // (identical offsets in the original).
    const openParen = m.index + m[0].length - 1;
    const closeParen = matchBracket(src, openParen, "(", ")");
    if (closeParen < 0) continue;
    out.push({ index: m.index, argsText: src.slice(openParen + 1, closeParen) });
  }
  return out;
}
