import type { HookpadChordInput } from "@plugins/integrations/plugins/hooktheory/core";

/**
 * How a chord was WRITTEN, as opposed to how it sounds (its token). A closed
 * list: a curriculum level such as "secondary dominants" filters on these, so
 * the set is part of the index's derivation version.
 *
 * - `seventh` — a 7th chord (`type` 7). A 9th/11th/13th is `extended`, not also `seventh`.
 * - `extended` — a 9th, 11th or 13th (`type` ≥ 9).
 * - `inverted` — not in root position.
 * - `applied` — a secondary chord (V/x, vii°/x, …).
 * - `borrowed` — borrowed from another mode or a custom scale.
 * - `suspended`, `altered`, `added`, `omitted` — carries suspensions, alterations, adds, omits.
 */
export const CHORD_FEATURES = [
  "seventh",
  "extended",
  "inverted",
  "applied",
  "borrowed",
  "suspended",
  "altered",
  "added",
  "omitted",
] as const;
export type ChordFeature = (typeof CHORD_FEATURES)[number];

type SpellingFields = Pick<
  HookpadChordInput,
  | "type"
  | "inversion"
  | "applied"
  | "borrowed"
  | "suspensions"
  | "alterations"
  | "adds"
  | "omits"
>;

const HAS: Record<ChordFeature, (c: SpellingFields) => boolean> = {
  seventh: (c) => c.type === 7,
  extended: (c) => c.type >= 9,
  inverted: (c) => c.inversion > 0,
  applied: (c) => c.applied > 0,
  borrowed: (c) =>
    c.borrowed !== null && (Array.isArray(c.borrowed) || c.borrowed !== ""),
  suspended: (c) => c.suspensions.length > 0,
  altered: (c) => c.alterations.length > 0,
  added: (c) => c.adds.length > 0,
  omitted: (c) => c.omits.length > 0,
};

/** The features of one sounding chord's spelling, in `CHORD_FEATURES` order. */
export function chordFeatures(chord: SpellingFields): ChordFeature[] {
  return CHORD_FEATURES.filter((feature) => HAS[feature](chord));
}
