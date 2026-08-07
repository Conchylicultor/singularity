// Aligning two flattened documents: which OLD node is which NEW node.
//
// Three passes, in this order, each with strictly weaker evidence than the one
// before it. That ordering IS the design — a later pass may only claim nodes an
// earlier one left unclaimed.
//
//  1. **LCS over identity keys** (`diffArrays`). Order-preserving exact matches.
//     This is why the engine exists in this shape: a page with five identical
//     `- item` lines has five identical keys, so any content-keyed matcher (the
//     pages history diff's greedy `type::text` bucket is the precedent this
//     improves on) pairs them in whatever order it happens to pop them, and
//     editing the third re-pairs all five. An LCS pairs them BY POSITION, which
//     is the only correct answer available.
//  2. **Similarity within a gap.** Between two anchors the alignment already has
//     evidence that this REGION corresponds, so what is left there is an edit:
//     pair the best-resembling leftovers, best first.
//  3. **Similarity across the whole document.** What passes 1 and 2 left has no
//     positional evidence at all, so it is ranked by content alone. This pass is
//     what lets a block that MOVED keep its id: a move shows up as a removal in
//     one gap and an insertion in ANOTHER, which pass 2 (gap-local by
//     construction) can never pair — and losing identity on a move is exactly
//     the loss this plugin exists to prevent.
//
// Pinned nodes — the ones whose identity is ASSERTED rather than inferred — sit
// outside all of this; see {@link forcePins}.

import { diffArrays } from "diff";

/** One node as the aligner sees it. Nothing here knows about blocks or rows. */
export interface AlignItem {
  /** Exact-match identity (see `flatten.ts`). */
  key: string;
  /** Plain text, for the fuzzy passes. `""` for void nodes. */
  plain: string;
  type: string;
  /**
   * Asserted identity (a row id), or null when this node's identity can only be
   * inferred from its content. Two pinned items pair IFF their pins are equal,
   * and never pair with anything else — see {@link forcePins}.
   */
  pin: string | null;
}

/**
 * There is deliberately **no similarity threshold**. Admission is decided by
 * {@link comparable} alone; similarity only RANKS the admitted candidates.
 *
 * A threshold was the obvious design and it is the wrong one, because the
 * quantity it would gate is not a measure of "same block". Normalizing an edit
 * distance by length punishes short text for being short: appending one word to
 * `bravo` scores 0.38, while rewriting a long paragraph's second half scores
 * 0.5 — so any cut-off either drops the commonest agent edit or admits
 * everything anyway. Whatever number is chosen, the pairs it rejects become a
 * delete plus a create, i.e. the block loses its content doc, its undo history,
 * its backlink edges and its `tasks_ext_prompt_block` link — the precise loss
 * this whole plugin exists to prevent.
 *
 * What actually keeps a pairing honest is the GATE: a node never pairs across
 * block types unless its text is identical (a conversion), so an image can
 * never absorb a heading's identity. Everything the gate admits is, by
 * construction, "an edit to a block of this type in this position" — and
 * position is what the LCS pass has already established.
 *
 * The bound this leaves, stated rather than hidden: replacing a paragraph with
 * an unrelated one of the same type reads as an EDIT, not as a delete plus a
 * create, so per-block metadata follows the position rather than the words.
 * That is the same call every line-oriented diff makes.
 */

/**
 * Edit distance is O(n·m) in characters. A block's text is unbounded (a pasted
 * essay in one paragraph), so compare a bounded prefix: two texts agreeing on
 * their first 512 characters and differing later are, for the purpose of "is
 * this the same block", the same block.
 */
const SIM_MAX_CHARS = 512;

/**
 * Beyond this many candidate pairs a fuzzy pass stops scoring every pair and
 * falls back to positional pairing within exact-plain-text buckets (which is
 * where all the score-1.0 pairs live anyway). A region this large is a rewrite,
 * not an edit, and a rewrite must not cost quadratic time.
 */
const FUZZY_PAIR_CAP = 50_000;

/** Levenshtein distance over two bounded strings (two-row DP). */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Normalized text similarity in `[0, 1]`; two empty texts are identical. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const left = a.slice(0, SIM_MAX_CHARS);
  const right = b.slice(0, SIM_MAX_CHARS);
  const max = Math.max(left.length, right.length);
  if (max === 0) return 1;
  return 1 - editDistance(left, right) / max;
}

/**
 * May these two nodes be considered the same block at all? Same type + changed
 * text is an EDIT; same text + changed type is a CONVERSION. Neither shared is
 * a different block wearing a coincidental resemblance, and pairing it would
 * move an id onto content that has nothing to do with it.
 */
function comparable(a: AlignItem, b: AlignItem): boolean {
  if (a.pin !== null || b.pin !== null) return false;
  return a.type === b.type || a.plain === b.plain;
}

interface Candidate {
  oldIndex: number;
  newIndex: number;
  score: number;
  /** Positional distance WITHIN the pass's own window — the tie-break. */
  distance: number;
}

/**
 * Greedy best-first claiming over scored candidates. Ordered by score, then by
 * positional distance — so a field of ties (every void block of one type scores
 * 1.0 against every other) resolves POSITIONALLY, the same answer the LCS would
 * have given if the keys had matched.
 */
function claimBest(
  candidates: Candidate[],
  pairs: Map<number, number>,
  usedOld: Set<number>,
): void {
  candidates.sort(
    (x, y) => y.score - x.score || x.distance - y.distance || x.oldIndex - y.oldIndex,
  );
  for (const c of candidates) {
    if (usedOld.has(c.oldIndex) || pairs.has(c.newIndex)) continue;
    usedOld.add(c.oldIndex);
    pairs.set(c.newIndex, c.oldIndex);
  }
}

/**
 * Score every comparable pair in a region, or — past {@link FUZZY_PAIR_CAP} —
 * only the exact-plain-text ones, bucketed and paired positionally. The fallback
 * is not a degradation of the answer for the pairs it keeps: those all score
 * 1.0, which is the top of the ordering anyway. It IS a degradation for the rest
 * (they become delete + create), which is the price of refusing to go quadratic
 * on a region that is a rewrite rather than an edit.
 */
function pairRegion(
  oldIdx: number[],
  newIdx: number[],
  oldItems: readonly AlignItem[],
  newItems: readonly AlignItem[],
  pairs: Map<number, number>,
  usedOld: Set<number>,
): void {
  if (oldIdx.length === 0 || newIdx.length === 0) return;

  const candidates: Candidate[] = [];
  if (oldIdx.length * newIdx.length <= FUZZY_PAIR_CAP) {
    for (let i = 0; i < oldIdx.length; i++) {
      const a = oldItems[oldIdx[i]!]!;
      for (let j = 0; j < newIdx.length; j++) {
        const b = newItems[newIdx[j]!]!;
        if (!comparable(a, b)) continue;
        const score = similarity(a.plain, b.plain);
        candidates.push({
          oldIndex: oldIdx[i]!,
          newIndex: newIdx[j]!,
          score,
          distance: Math.abs(i - j),
        });
      }
    }
  } else {
    const buckets = new Map<string, number[]>();
    for (let i = 0; i < oldIdx.length; i++) {
      const a = oldItems[oldIdx[i]!]!;
      if (a.pin !== null) continue;
      const bucketKey = `${a.type}${a.plain}`;
      const list = buckets.get(bucketKey);
      if (list) list.push(i);
      else buckets.set(bucketKey, [i]);
    }
    const taken = new Map<string, number>();
    for (let j = 0; j < newIdx.length; j++) {
      const b = newItems[newIdx[j]!]!;
      if (b.pin !== null) continue;
      const bucketKey = `${b.type}${b.plain}`;
      const list = buckets.get(bucketKey);
      if (!list) continue;
      const at = taken.get(bucketKey) ?? 0;
      const i = list[at];
      if (i === undefined) continue;
      taken.set(bucketKey, at + 1);
      candidates.push({
        oldIndex: oldIdx[i]!,
        newIndex: newIdx[j]!,
        score: 1,
        distance: Math.abs(i - j),
      });
    }
  }
  claimBest(candidates, pairs, usedOld);
}

/**
 * A pinned node's identity is asserted, not inferred, so it is settled LAST and
 * unconditionally: whatever the three content passes concluded, two nodes
 * sharing a pin are the same row and nothing else may be. A pin is unique on
 * each side (it is a row id), so this can never steal a partner from another
 * pairing — a pinned key can only ever have been matched against its own twin.
 *
 * It has to be a separate pass rather than a special case inside pass 1: an
 * exact-key LCS drops a match whose ORDER crossed, and a node that merely MOVED
 * must not thereby become "delete this row and mint a fresh one" — which for a
 * sub-page shell would read as "delete this page and mint a link", and for an
 * identified card would detach the card's authorship from its content.
 */
function forcePins(
  oldItems: readonly AlignItem[],
  newItems: readonly AlignItem[],
  pairs: Map<number, number>,
  usedOld: Set<number>,
): void {
  const oldByPin = new Map<string, number>();
  for (let i = 0; i < oldItems.length; i++) {
    const pin = oldItems[i]!.pin;
    if (pin !== null) oldByPin.set(pin, i);
  }
  for (let j = 0; j < newItems.length; j++) {
    const pin = newItems[j]!.pin;
    if (pin === null) continue;
    const i = oldByPin.get(pin);
    if (i === undefined) continue;
    const currentPartner = pairs.get(j);
    if (currentPartner === i) continue;
    if (currentPartner !== undefined) usedOld.delete(currentPartner);
    for (const [otherNew, otherOld] of pairs) {
      if (otherOld === i) pairs.delete(otherNew);
    }
    usedOld.add(i);
    pairs.set(j, i);
  }
}

/** `newIndex → oldIndex` for every node the alignment could pair. */
export type Alignment = Map<number, number>;

export function alignItems(
  oldItems: readonly AlignItem[],
  newItems: readonly AlignItem[],
): Alignment {
  const pairs: Alignment = new Map();
  const usedOld = new Set<number>();

  // --- Pass 1: LCS over the identity keys ----------------------------------
  // `diffArrays` emits its changes in document order; a removal and its
  // replacement arrive as two adjacent chunks in either order, so both are
  // accumulated and the gap is only settled at the next UNCHANGED run.
  const changes = diffArrays(
    oldItems.map((n) => n.key),
    newItems.map((n) => n.key),
  );
  let oi = 0;
  let ni = 0;
  let gapOld: number[] = [];
  let gapNew: number[] = [];
  const gaps: { old: number[]; new: number[] }[] = [];
  const flushGap = (): void => {
    if (gapOld.length > 0 || gapNew.length > 0) gaps.push({ old: gapOld, new: gapNew });
    gapOld = [];
    gapNew = [];
  };
  for (const change of changes) {
    const count = change.value.length;
    if (change.removed) {
      for (let k = 0; k < count; k++) gapOld.push(oi + k);
      oi += count;
    } else if (change.added) {
      for (let k = 0; k < count; k++) gapNew.push(ni + k);
      ni += count;
    } else {
      flushGap();
      for (let k = 0; k < count; k++) {
        pairs.set(ni + k, oi + k);
        usedOld.add(oi + k);
      }
      oi += count;
      ni += count;
    }
  }
  flushGap();

  // --- Pass 2: similarity, gap-local ---------------------------------------
  for (const gap of gaps) {
    pairRegion(gap.old, gap.new, oldItems, newItems, pairs, usedOld);
  }

  // --- Pass 3: similarity, whole-document ----------------------------------
  const leftoverOld: number[] = [];
  for (let i = 0; i < oldItems.length; i++) if (!usedOld.has(i)) leftoverOld.push(i);
  const leftoverNew: number[] = [];
  for (let j = 0; j < newItems.length; j++) if (!pairs.has(j)) leftoverNew.push(j);
  pairRegion(leftoverOld, leftoverNew, oldItems, newItems, pairs, usedOld);

  forcePins(oldItems, newItems, pairs, usedOld);
  return pairs;
}
