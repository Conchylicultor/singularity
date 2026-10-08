import { inlineBoundary, type AnyIdKind } from "@plugins/ids/core";

/**
 * Where an id chip belongs — the literal values of inline-chip's
 * `ChipSurface`, restated here because the SERVER half needs them too (does a
 * page block's doc hold this chip → it needs an `Editor.InlineToken`) and
 * inline-chip's type lives in its web barrel.
 */
export type IdChipSurface = "transcript" | "document";

/**
 * THE inline pattern of a kind's chip: `inlineBoundary(kind.pattern)`. Both
 * runtimes build it here, so the chip's pattern and its server halves'
 * (`Editor.InlineToken`, `InlineTokenReferentSource`) are the same source —
 * the join key `active-data:document-chip-has-server-token` /
 * `resolved-chip-has-referent` match on — by construction.
 *
 * Memoized per kind so every reader holds one RegExp object.
 */
const patterns = new WeakMap<AnyIdKind, RegExp>();
export function idChipPattern(kind: AnyIdKind): RegExp {
  let pattern = patterns.get(kind);
  if (!pattern) {
    pattern = inlineBoundary(kind.pattern);
    patterns.set(kind, pattern);
  }
  return pattern;
}

/** The tag a model reads a resolved id as: `<task id="…" title="…"/>`. */
export function idReferentTag(kind: AnyIdKind): string {
  return kind.label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
