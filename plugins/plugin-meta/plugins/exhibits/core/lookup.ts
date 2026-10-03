/**
 * The result of looking an exhibit up by id. Two plugins claiming one id is
 * its own arm rather than "whichever registered first", so a clash is seen
 * instead of silently resolved. `missing` is ordinary for a consumer whose ids
 * come from outside the repo (a prototype naming an exhibit that exists only
 * on another branch).
 */
export type ExhibitLookup<T> =
  | { kind: "found"; exhibit: T }
  | { kind: "missing" }
  | { kind: "ambiguous"; exhibits: readonly T[] };

/** Resolve `id` against a catalog snapshot. Pure, so it is testable alone. */
export function lookupExhibit<T extends { id: string }>(
  all: readonly T[],
  id: string,
): ExhibitLookup<T> {
  const matches = all.filter((e) => e.id === id);
  const [only, ...more] = matches;
  if (only === undefined) return { kind: "missing" };
  if (more.length > 0) return { kind: "ambiguous", exhibits: matches };
  return { kind: "found", exhibit: only };
}
