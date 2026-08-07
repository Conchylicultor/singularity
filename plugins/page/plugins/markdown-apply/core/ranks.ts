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
 * Mint `count` ranks strictly inside `(prev, next)`, above every `obstacle` that
 * falls in that interval, and write them into `out[from…]`.
 *
 * An obstacle is a rank the interval already contains and that nobody is going
 * to move, so it splits `(prev, next)` into sub-intervals — `(prev, o1)`,
 * `(o1, o2)`, … `(om, next)` — and the run goes into the LAST of them, whose
 * open interval is provably free of any live rank. That is what makes the result
 * collision-free rather than merely unlikely to collide: `Rank.nBetween` is
 * deterministic, so minting the midpoint of an interval an invisible row already
 * sits at reproduces its key exactly. In effect the obstacles only pick the
 * run's floor.
 *
 * **Stated bound, unconditional: blocks inserted where a hidden row sits land
 * AFTER it, contiguously.** Either side of the hidden row equally satisfies the
 * agent's intent — it could not see the row — so the tie-break is decided by
 * what else is at stake, and that is CONTIGUITY. The movers are consecutive in
 * the incoming document; interleaving them with the obstacles (`A N1 P N2 B`)
 * would wedge the human's hidden card inside a sequence the agent authored as a
 * unit AND break the authored order, while buying nothing: a hidden row sits
 * strictly between the same two visible survivors either way, which is the only
 * position it can be said to have. Several hidden rows in one run therefore
 * migrate together to the run's start, keeping their relative order.
 *
 * Still one `nBetween` for the whole run rather than walking `between` down it,
 * which is what keeps keys short.
 */
function mintRun(
  out: (string | null)[],
  from: number,
  count: number,
  prev: Rank | null,
  next: Rank | null,
  obstacles: readonly Rank[],
): void {
  // `obstacles` is sorted, so the last one strictly inside `(prev, next)` is the
  // greatest — the floor the run must clear.
  let floor = prev;
  for (const o of obstacles) {
    if (prev !== null && Rank.compare(prev, o) >= 0) continue;
    if (next !== null && Rank.compare(o, next) >= 0) break;
    floor = o;
  }
  const minted = Rank.nBetween(floor, next, count);
  for (let k = 0; k < count; k++) out[from + k] = minted[k]!.toJSON();
}

/**
 * The final rank of every element of one sibling list, in the desired order.
 *
 * `existing[i]` is the rank that element ALREADY holds **in this sibling list**
 * — null when it is new, or when it is arriving from a different parent (a rank
 * is only meaningful within one `(parent_id, rank)` space, so a rank carried in
 * from elsewhere is not a rank here).
 *
 * @param reserved Ranks already held, in THIS sibling list, by live rows the
 *   incoming document never saw (a redacted card). They are not placed and not
 *   re-ranked; they only make their own key unavailable. A reserved rank can
 *   never equal a survivor's — the live unique index says so — so treating them
 *   as additional fixed points is total.
 *
 * The returned array is strictly increasing, and every returned rank that equals
 * its `existing` counterpart is an element the caller must NOT write.
 */
export function planSiblingRanks(
  existing: readonly (string | null)[],
  reserved: readonly string[] = [],
): string[] {
  const n = existing.length;
  const out = new Array<string | null>(n).fill(null);

  const candidates: number[] = [];
  for (let i = 0; i < n; i++) if (existing[i] !== null) candidates.push(i);
  const kept = new Set(
    longestIncreasing(candidates.map((i) => existing[i]!)).map((k) => candidates[k]!),
  );
  for (const i of kept) out[i] = existing[i]!;

  // Sorted once, then filtered per run: a run's obstacles are the reserved ranks
  // that fall strictly inside ITS interval, so a reserved rank sitting anywhere
  // else in the sibling list costs nothing and changes nothing.
  const obstacles = [...new Set(reserved)]
    .map((r) => Rank.from(r))
    .sort((a, b) => Rank.compare(a, b));

  // Every maximal run of movers sits between two FIXED neighbours (or an open
  // end) — no kept rank lies strictly between them, because the kept ranks are
  // increasing in output order.
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
    mintRun(out, i, j - i, prev, next, obstacles);
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
