import type { AnyIdKind } from "./id-kind";
import { inlineBoundary } from "./inline-boundary";

/** One id found in text: which kind, the id as written, and its span. */
export interface DetectedId {
  kind: AnyIdKind;
  id: string;
  start: number;
  end: number;
}

/**
 * Every id of `kinds` written bare in `text`, in reading order, read with the
 * inline boundary (`inlineBoundary`): an id inside a path or URL, or followed
 * by a dotted suffix, is not a mention. Each kind is read by its `pattern` —
 * its own prefix only: an alias (`claude-…`, shared by attempts and
 * conversations) cannot say which kind it is, so it is never detected. Where
 * two kinds' matches still overlap, the one starting first wins, then the
 * longer, then the earlier kind in `kinds`.
 *
 * Generic: the caller hands in the kinds (a registry read at call time —
 * `useIdKinds()` / `getIdKinds()`), so this names none.
 */
export function detectIds(
  text: string,
  kinds: readonly AnyIdKind[],
): DetectedId[] {
  const found: DetectedId[] = [];
  for (const kind of kinds) {
    for (const match of text.matchAll(inlineBoundary(kind.pattern))) {
      found.push({
        kind,
        id: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  // Stable sort: equal spans keep `kinds` order.
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: DetectedId[] = [];
  let cursor = 0;
  for (const hit of found) {
    if (hit.start < cursor) continue;
    out.push(hit);
    cursor = hit.end;
  }
  return out;
}
