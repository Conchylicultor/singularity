import type { SpecimenInfo, SpecimenLookup } from "./types";

/** Resolve `id` against a registry snapshot. Pure, so it is testable alone. */
export function lookupSpecimen(
  all: readonly SpecimenInfo[],
  id: string,
): SpecimenLookup {
  const matches = all.filter((s) => s.id === id);
  const [only, ...more] = matches;
  if (only === undefined) return { kind: "missing" };
  if (more.length > 0) return { kind: "ambiguous", specimens: matches };
  return { kind: "found", specimen: only };
}
