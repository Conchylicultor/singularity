import { Rank } from "@plugins/primitives/plugins/rank/core";

/** One page row of a sidebar group, in DOCUMENT order, with its stored key. */
export interface DocRankSlot {
  id: string;
  /** The stored `doc_rank`; `null` for a row that has never been given one. */
  docRank: Rank | null;
}

/** A row whose `doc_rank` must change, and the key it changes to. */
export interface DocRankChange {
  id: string;
  /** What it held before — `null` when the row had no key (a backfill). */
  from: Rank | null;
  to: Rank;
}

/**
 * The fewest `doc_rank` writes that make one sidebar group's keys strictly
 * ascending in the document order `slots` arrives in.
 *
 * Keeps the LONGEST strictly-increasing subsequence of the existing keys and
 * re-mints each run between two kept keys with `Rank.nBetween(prev, next, n)`.
 * That is what makes the column routable: a drag that moves one sub-page past
 * its siblings changes exactly that one row, and a group already in order
 * changes nothing — so a re-mint is an ordinary write of the rows that moved,
 * never a re-numbering of the whole group. A `null` key (a page that has not
 * been placed yet, or a whole group on its first boot) is never kept, so it is
 * always minted.
 *
 * Pure, and the only place the minting rule lives: both the per-write reconcile
 * (`withPageForest`) and the boot reconcile call it, so the two cannot disagree
 * about what an ordered group looks like. Returns only the rows that change.
 *
 * THROWS if its own output is not strictly ascending — a duplicate key would
 * make the group's order a function of the database's tie-break, which is the
 * exact bug `doc_rank` exists to remove, and there is no unique index to catch
 * it later.
 */
export function planDocRanks(slots: readonly DocRankSlot[]): DocRankChange[] {
  const kept = longestIncreasingRun(slots);
  const final: Rank[] = new Array<Rank>(slots.length);
  const changes: DocRankChange[] = [];

  let i = 0;
  while (i < slots.length) {
    if (kept.has(i)) {
      final[i] = slots[i]!.docRank!;
      i++;
      continue;
    }
    // A maximal run of rows to re-mint, bounded by the kept keys either side.
    let j = i;
    while (j < slots.length && !kept.has(j)) j++;
    const prev = i > 0 ? final[i - 1]! : null;
    const next = j < slots.length ? slots[j]!.docRank! : null;
    const minted = Rank.nBetween(prev, next, j - i);
    for (let k = i; k < j; k++) {
      const to = minted[k - i]!;
      final[k] = to;
      const from = slots[k]!.docRank;
      if (from === null || !Rank.equals(from, to)) {
        changes.push({ id: slots[k]!.id, from, to });
      }
    }
    i = j;
  }

  for (let k = 1; k < final.length; k++) {
    if (Rank.compare(final[k - 1]!, final[k]!) !== -1) {
      throw new Error(
        `planDocRanks: keys not strictly ascending at ${slots[k - 1]!.id} (${final[k - 1]!.toString()}) → ${slots[k]!.id} (${final[k]!.toString()})`,
      );
    }
  }
  return changes;
}

/**
 * Indices of one longest STRICTLY increasing subsequence of the non-null keys
 * (patience sorting, O(n log n)). Strict, so two rows sharing a key never both
 * survive — one of them is re-minted, which is how a duplicate heals.
 */
function longestIncreasingRun(slots: readonly DocRankSlot[]): Set<number> {
  // `tails[l]` = index of the smallest key ending an increasing run of length
  // l + 1; `prevOf[i]` = the index before `i` in the run ending at `i`.
  const tails: number[] = [];
  const prevOf = new Array<number>(slots.length).fill(-1);
  for (let i = 0; i < slots.length; i++) {
    const key = slots[i]!.docRank;
    if (key === null) continue;
    // First run length whose tail key is >= key (strict increase).
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (Rank.compare(slots[tails[mid]!]!.docRank!, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    prevOf[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  }
  const kept = new Set<number>();
  let at = tails.length > 0 ? tails[tails.length - 1]! : -1;
  while (at !== -1) {
    kept.add(at);
    at = prevOf[at]!;
  }
  return kept;
}
