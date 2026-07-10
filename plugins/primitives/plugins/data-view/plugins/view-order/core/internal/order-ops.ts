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
 * Applied to the **display** order (the rank-sorted projection of the ordered
 * set), never the source order — the user drags in display order, and computing
 * the splice over anything else discards the arrangement (`computeMoveWrites`
 * below feeds it the display sequence it derives itself).
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

/** One row the client mints and the server upserts: a `(rowKey, rank)` pair. */
export interface RowOrderWrite {
  rowKey: string;
  rank: Rank;
}

/**
 * The **bounded** write set for one drag — the whole point of this rule: a drag
 * costs `O(gesture)`, not `O(view)`. Instead of persisting the view's entire
 * ordered set (the old full replace), it persists only the moved row `X` plus the
 * *seeds that now sit ahead of `X`* in the post-move display order. Nothing is
 * deleted; everything after `X` stays seeded.
 *
 * Return contract, mirroring `applyMove`'s discriminated failure:
 * - **`null`** — a broken caller invariant (`id`/`targetId` outside the ordered
 *   set). Never an empty array a caller could POST.
 * - **`[]`** — a legitimate no-op (dropped onto itself / already adjacent): skip
 *   the POST.
 * - a **non-empty, rank-ascending** array otherwise.
 *
 * ### The standing invariant it preserves
 *
 * `seedRanks` guarantees **persisted rows always display before seeded rows** —
 * the seeds are a suffix appended after `max(persisted)`, in source order. Every
 * branch here keeps that true, which is exactly why the next render's re-seed
 * reproduces the dropped order (the round-trip property test is the real gate).
 *
 * Materialized seeds are ranked `> max(persisted)`, so they sort after every
 * pre-existing persisted row. `X` is ranked **last**, once its materialized
 * predecessors exist:
 *
 * - `pred` = the key immediately before `X` in `next` — always persisted by
 *   construction (everything before `X` either already was persisted, or was just
 *   materialized), so it is read from `effective` (persisted ∪ freshly minted).
 * - `succ` = the key immediately after `X`, read from **`persisted` — not
 *   `effective`**. A *seed* following `X` therefore yields `null`: `X` becomes the
 *   new `max(persisted)` and the untouched seeds re-seed after it, keeping the
 *   invariant. Reading `effective` here would be wrong — a just-materialized seed
 *   never follows `X` (materialized seeds are all *before* `X`), but reading
 *   `persisted` is the honest expression of "is the successor a real persisted
 *   anchor `X` must slot in front of, or a seed that must re-flow after `X`".
 *
 * So `Rank.between(pred, succ)` never sees an inverted or equal pair.
 *
 * The materialize set is chosen by **position in `next`**, not by a source-order
 * prefix of the same count. A seed dragged *downward* must materialize the seeds
 * that ended up ahead of it — which reach a source index *past* `X`'s own;
 * "the first `m` seeds in source order" would silently no-op that drag. This is
 * the one non-obvious case; it has a dedicated test.
 */
export function computeMoveWrites(args: {
  /** The ordered set, in SOURCE order (this derives the display order itself). */
  orderedKeys: readonly string[];
  persisted: ReadonlyMap<string, Rank>;
  id: string;
  targetId: string;
  zone: "before" | "after";
}): RowOrderWrite[] | null {
  const { orderedKeys, persisted, id, targetId, zone } = args;

  // 1. Total, distinct ranks over the ordered set, then 2. the display order.
  const ranks = seedRanks(orderedKeys, persisted);
  const display = [...orderedKeys].sort((a, b) =>
    Rank.compare(ranks.get(a)!, ranks.get(b)!),
  );

  // 3. Splice X to its new slot in DISPLAY order. `null` propagates the broken
  //    invariant; an unchanged sequence is a legitimate no-op (skip the POST).
  const next = applyMove(display, id, targetId, zone);
  if (next === null) return null;
  if (next.every((key, i) => key === display[i])) return [];

  // 4. The seeds now ahead of X, in next-order — every unpersisted key before X.
  const xIdx = next.indexOf(id);
  const toMaterialize = next
    .slice(0, xIdx)
    .filter((key) => !persisted.has(key));

  // 5. Materialized seeds rank after `max(persisted)` — the max over the WHOLE
  //    map (including keys the view currently filters out), the same anchor
  //    `seedRanks` uses — so they sort after every pre-existing persisted row.
  let maxP: Rank | null = null;
  for (const rank of persisted.values()) {
    if (maxP === null || Rank.compare(rank, maxP) > 0) maxP = rank;
  }
  const minted = Rank.nBetween(maxP, null, toMaterialize.length);

  // 6. `effective` lets `pred` see a just-minted predecessor; `succ` reads
  //    `persisted` so a seed after X re-flows rather than pinning X.
  const effective = new Map(persisted);
  toMaterialize.forEach((key, i) => effective.set(key, minted[i]!));

  const pred = xIdx > 0 ? (effective.get(next[xIdx - 1]!) ?? null) : null;
  const succKey = next[xIdx + 1];
  const succ =
    succKey !== undefined ? (persisted.get(succKey) ?? null) : null;
  const rankX = Rank.between(pred, succ);

  // 7. The bounded write: the materialized seeds, then X — rank-ascending.
  return [
    ...toMaterialize.map((key, i): RowOrderWrite => ({
      rowKey: key,
      rank: minted[i]!,
    })),
    { rowKey: id, rank: rankX },
  ];
}
