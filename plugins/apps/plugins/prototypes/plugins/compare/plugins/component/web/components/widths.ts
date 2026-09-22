import type { WidthChoices } from "@plugins/apps/plugins/prototypes/plugins/compare/web";

/** Offered when the specimen declares no widths of its own. */
const FALLBACK_WIDTHS = [360, 640, 960] as const;

/**
 * The specimen's own widths (or the fallback), always merged with the width
 * the prototype declares — the width the mock was drawn at, so the one both
 * halves are certain to have something to say about.
 */
export function specimenWidths(
  own: readonly number[] | undefined,
  declared: number,
): WidthChoices {
  const base = own !== undefined && own.length > 0 ? own : FALLBACK_WIDTHS;
  const [first, ...rest] = [...new Set([...base, declared])].sort(
    (a, b) => a - b,
  );
  // The set holds `declared` at minimum, so it is never empty.
  return first === undefined ? [declared] : [first, ...rest];
}
