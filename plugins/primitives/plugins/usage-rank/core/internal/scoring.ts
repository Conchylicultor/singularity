import { HALF_LIFE_MS } from "./keys";
import type { UsageStat } from "./schema";

/** The fields scoring actually reads — so a test (or a caller holding a partial
 * row) never has to fabricate a whole `UsageStat`. */
export type ScorableStat = Pick<UsageStat, "score" | "lastUsedAt">;

/**
 * The stored score decayed forward to `now`: `score * 0.5^(Δt / HALF_LIFE)`.
 *
 * The stored value is only meaningful as of its own `lastUsedAt` (the upsert
 * decays to that instant, then adds 1). Comparing two rows by their raw stored
 * scores would rank a heavily-used-last-year item above a weekly-used one
 * forever, so every comparison decays BOTH sides to one shared `now`.
 *
 * Δt is clamped at 0: a row stamped in the future (clock skew between the DB's
 * `now()` and the browser's) must not be *amplified* by a negative exponent.
 */
export function decayedScore(stat: ScorableStat, now: number): number {
  const elapsed = Math.max(0, now - stat.lastUsedAt.getTime());
  return stat.score * Math.pow(0.5, elapsed / HALF_LIFE_MS);
}

/**
 * Order `keys` by decayed usage, most-used first — STABLE: equal scores (and
 * never-used keys, which all score 0) keep their incoming relative order, so
 * the caller's authored order is the tie-break and an untouched namespace
 * renders exactly as authored.
 *
 * `statsByKey` is keyed by the SAME strings as `keys` (the caller's domain
 * keys), not by `usageKey` — the namespace join is the caller's business, not
 * the sort's.
 */
export function sortByUsage(
  keys: readonly string[],
  statsByKey: ReadonlyMap<string, ScorableStat>,
  now: number,
): string[] {
  // Score once per key up front: a comparator that recomputed `pow` per
  // comparison would be both O(n log n) pows and — if `now` were re-read —
  // non-transitive, which is undefined behaviour for `sort`.
  const scores = new Map<string, number>();
  for (const key of keys) {
    const stat = statsByKey.get(key);
    scores.set(key, stat ? decayedScore(stat, now) : 0);
  }
  // Array.prototype.sort is required to be stable (ES2019), which IS the
  // tie-break rule above — not an accident we tolerate.
  return [...keys].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
}
