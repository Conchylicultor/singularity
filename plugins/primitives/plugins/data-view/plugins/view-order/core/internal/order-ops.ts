import { Rank } from "@plugins/primitives/plugins/rank/core";

/**
 * Synthesize a **total** order over `orderedKeys`: persisted ranks kept verbatim,
 * then every unpersisted key appended after `max(persisted)` **in source order**.
 *
 * Total is the point. `ManualOrderConfig.getRank` returning `null` marks a row
 * un-draggable, and `orderSectionsByRank`'s comparator is under-specified for a
 * mixed section (it returns `0` for any null pair) — so a contributor that only
 * ranked the persisted rows would produce a section whose order is undefined.
 * Every key in `orderedKeys` therefore gets a rank here.
 *
 * `max(persisted)` is the max over the **whole** map, not just the keys in
 * `orderedKeys`: a row the view currently filters out still holds a rank, and a
 * seed must sort after it so the row keeps its place if the filter changes.
 *
 * **This is display-only — a seed is never written as-is.** The seeded order is
 * stable only because a move persists the view's *entire* ordered set at once
 * (see `applyMove` + the server handler). Seeding incrementally (persist just the
 * moved row, re-seed the rest next render) is unstable: with A,B,C unpersisted,
 * dropping C between A and B persists only `C → r1`; next render A and B re-seed
 * after `max(persisted) = r1`, flipping the display to C,A,B. `order-ops.test.ts`
 * pins that counterexample.
 */
export function seedRanks(
  orderedKeys: readonly string[],
  persisted: ReadonlyMap<string, Rank>,
): Map<string, Rank> {
  const ranks = new Map<string, Rank>();
  const unpersisted: string[] = [];
  for (const key of orderedKeys) {
    const rank = persisted.get(key);
    if (rank) ranks.set(key, rank);
    else unpersisted.push(key);
  }
  if (unpersisted.length === 0) return ranks;

  // The resource arrives rank-ordered, but derive the max rather than trusting
  // the map's insertion order — a caller building `persisted` some other way
  // would otherwise seed silently-misplaced rows.
  let maxPersisted: Rank | null = null;
  for (const rank of persisted.values()) {
    if (maxPersisted === null || Rank.compare(rank, maxPersisted) > 0) {
      maxPersisted = rank;
    }
  }

  // `nBetween(prev, null, n)` returns exactly `n` ranks, so the index is total.
  const seeds = Rank.nBetween(maxPersisted, null, unpersisted.length);
  unpersisted.forEach((key, i) => ranks.set(key, seeds[i]!));
  return ranks;
}

/**
 * The post-move key sequence: remove `id`, re-insert it immediately
 * `before`/`after` `targetId`.
 *
 * Returns **`null`** when either `id` or `targetId` is absent from
 * `orderedKeys` — a broken caller invariant (both are members of the view's
 * ordered set by construction), reported as a discriminated failure rather than
 * an empty array a caller could POST as a legitimate "delete everything".
 *
 * Dropping a row onto itself is a legitimate no-op, not a failure: the unchanged
 * sequence is returned.
 */
export function applyMove(
  orderedKeys: readonly string[],
  id: string,
  targetId: string,
  zone: "before" | "after",
): string[] | null {
  if (!orderedKeys.includes(id) || !orderedKeys.includes(targetId)) return null;
  if (id === targetId) return [...orderedKeys];

  const without = orderedKeys.filter((key) => key !== id);
  const targetIndex = without.indexOf(targetId);
  without.splice(zone === "before" ? targetIndex : targetIndex + 1, 0, id);
  return without;
}
