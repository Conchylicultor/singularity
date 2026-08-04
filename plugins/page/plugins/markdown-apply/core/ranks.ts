// Re-ranking a sibling list with the fewest possible writes.
//
// The desired order is known (the incoming document says so). Some of those
// siblings already hold a rank in this very sibling list. The question is which
// of them must MOVE, and the answer is not "the ones that look out of place" —
// it is the complement of a longest strictly-increasing subsequence of their
// stored ranks. Everything in that subsequence is already in the right relative
// order and keeps its rank BYTE-FOR-BYTE; only the rest is minted anew, into the
// open intervals the fixed ones leave behind.
//
// Why it matters that this is minimal rather than merely correct: a rank write
// is a `(parent_id, rank)` pair change, which the forest writer must park to get
// past the live unique index, and every re-ranked row is a row the page's
// optimistic overlay has to reconcile. Reordering one paragraph should cost one
// rank, not a rewrite of the sibling list.

import { Rank } from "@plugins/primitives/plugins/rank/core";

/**
 * Indices of a longest strictly-increasing subsequence of `ranks` (patience
 * sorting, O(n log n)). Strict, not non-decreasing: two live siblings can never
 * share a rank, so a tie means the two values came from different sibling lists
 * and at most one of them may stay.
 */
function longestIncreasing(ranks: readonly string[]): number[] {
  const tails: number[] = [];
  const prev = new Array<number>(ranks.length).fill(-1);
  for (let i = 0; i < ranks.length; i++) {
    const value = Rank.from(ranks[i]!);
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Rank.compare(Rank.from(ranks[tails[mid]!]!), value) < 0) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  }
  const out: number[] = [];
  let k = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (k >= 0) {
    out.push(k);
    k = prev[k]!;
  }
  return out.reverse();
}

/**
 * The final rank of every element of one sibling list, in the desired order.
 *
 * `existing[i]` is the rank that element ALREADY holds **in this sibling list**
 * — null when it is new, or when it is arriving from a different parent (a rank
 * is only meaningful within one `(parent_id, rank)` space, so a rank carried in
 * from elsewhere is not a rank here).
 *
 * The returned array is strictly increasing, and every returned rank that equals
 * its `existing` counterpart is an element the caller must NOT write.
 */
export function planSiblingRanks(existing: readonly (string | null)[]): string[] {
  const n = existing.length;
  const out = new Array<string | null>(n).fill(null);

  const candidates: number[] = [];
  for (let i = 0; i < n; i++) if (existing[i] !== null) candidates.push(i);
  const kept = new Set(
    longestIncreasing(candidates.map((i) => existing[i]!)).map((k) => candidates[k]!),
  );
  for (const i of kept) out[i] = existing[i]!;

  // Every maximal run of movers sits between two FIXED neighbours (or an open
  // end), so one `nBetween` per run splits the interval once instead of walking
  // `between` down it — which is what keeps keys short.
  let i = 0;
  while (i < n) {
    if (kept.has(i)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < n && !kept.has(j)) j += 1;
    const prev = i > 0 ? Rank.from(out[i - 1]!) : null;
    const next = j < n ? Rank.from(out[j]!) : null;
    const minted = Rank.nBetween(prev, next, j - i);
    for (let k = i; k < j; k++) out[k] = minted[k - i]!.toJSON();
    i = j;
  }

  return out as string[];
}

/** The greatest of `ranks`, or null when there are none. */
export function maxRank(ranks: readonly string[]): Rank | null {
  let max: Rank | null = null;
  for (const raw of ranks) {
    const rank = Rank.from(raw);
    if (max === null || Rank.compare(rank, max) > 0) max = rank;
  }
  return max;
}
