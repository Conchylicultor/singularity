/**
 * Tests for the rank fractional-indexing core. Run with
 * `bun test plugins/primitives/plugins/rank/core/internal/rank.test.ts`.
 *
 * The load-bearing invariant: a rank produced by `Rank.between(a, b)` always
 * sorts STRICTLY between `a` and `b` under plain JS string `<` comparison (the
 * same byte-order the `rank_text` PostgreSQL domain uses, per CLAUDE.md), and
 * you can keep inserting between two adjacent ranks forever without a collision
 * or a full-list rewrite. `Rank.nBetween` is the bulk-split variant: `n` ranks
 * strictly between two neighbors, in ascending order, all distinct.
 *
 * This is THE authoritative ordering source for every sortable list in the
 * repo (tasks, pages, conversations, …) — if ordering breaks here, lists
 * silently reorder or collapse. It was previously untested.
 *
 * Three layers, mirroring keyed-delta-merge.test.ts: explicit scenarios, a
 * property test over many seeds with a seeded deterministic PRNG, and a
 * stress/fuzz layer building lists by random sequential insertion.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "./rank";

// Deterministic PRNG (mulberry32) so a fuzz failure is reproducible from its
// seed — `Math.random()` would make a red run impossible to replay.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Raw string of a Rank — the byte-order key callers actually compare/store.
const s = (r: Rank) => r.toString();

// Indexed read that narrows `T | undefined` to `T`, throwing on out-of-bounds
// (a test bug, never a rank bug). Lets the fuzz loops index a list whose
// in-bounds-ness they've already established without `!` assertions.
const at = <T,>(xs: readonly T[], i: number): T => {
  const v = xs[i];
  if (v === undefined) throw new Error(`index ${i} out of bounds (len ${xs.length})`);
  return v;
};

// Build an ascending list of `len` ranks by appending at the tail, tracking the
// previous rank directly so there's no indexed back-reference during the build.
const buildList = (len: number): Rank[] => {
  const list: Rank[] = [];
  let prev: Rank | null = null;
  for (let i = 0; i < len; i++) {
    prev = Rank.between(prev, null);
    list.push(prev);
  }
  return list;
};

// Strict string-order assertion under the same `<` the rank_text domain uses.
// Walks consecutive (prev, curr) pairs without unguarded indexing, mirroring
// the reference test's `.forEach((b, i) => …)` style.
const expectStrictlyOrdered = (ranks: Rank[]) => {
  let prev: Rank | undefined = undefined;
  for (const curr of ranks) {
    if (prev !== undefined) expect(s(prev) < s(curr)).toBe(true);
    prev = curr;
  }
};

describe("Rank — scenarios", () => {
  test("between(null, null) is a valid first key for an empty list", () => {
    const first = Rank.between(null, null);
    expect(typeof s(first)).toBe("string");
    expect(s(first).length).toBeGreaterThan(0);
  });

  test("between(prev, next) sorts strictly between prev and next", () => {
    const a = Rank.between(null, null);
    const c = Rank.between(a, null);
    const b = Rank.between(a, c); // squeeze between two adjacent keys
    expect(s(a) < s(b)).toBe(true);
    expect(s(b) < s(c)).toBe(true);
  });

  test("head insert (between null and first) sorts before the first", () => {
    const first = Rank.between(null, null);
    const head = Rank.between(null, first);
    expect(s(head) < s(first)).toBe(true);
  });

  test("tail insert (between last and null) sorts after the last", () => {
    const last = Rank.between(null, null);
    const tail = Rank.between(last, null);
    expect(s(last) < s(tail)).toBe(true);
  });

  test("compare matches raw byte order and is a total order (-1|0|1)", () => {
    const a = Rank.between(null, null);
    const b = Rank.between(a, null);
    expect(Rank.compare(a, b)).toBe(-1);
    expect(Rank.compare(b, a)).toBe(1);
    expect(Rank.compare(a, Rank.from(s(a)))).toBe(0);
  });

  test("equals is value identity, distinct from compare", () => {
    const a = Rank.between(null, null);
    const b = Rank.between(a, null);
    expect(Rank.equals(a, Rank.from(s(a)))).toBe(true);
    expect(Rank.equals(a, b)).toBe(false);
  });

  test("nBetween splits an open interval into n ascending distinct keys", () => {
    const ranks = Rank.nBetween(null, null, 5);
    expect(ranks.length).toBe(5);
    expectStrictlyOrdered(ranks);
    expect(new Set(ranks.map(s)).size).toBe(5);
  });

  test("nBetween(prev, next, n) keeps every key strictly inside (prev, next)", () => {
    const prev = Rank.between(null, null);
    const next = Rank.between(prev, null);
    const mids = Rank.nBetween(prev, next, 4);
    expect(mids.length).toBe(4);
    expectStrictlyOrdered([prev, ...mids, next]); // whole sequence ordered
  });

  test("nBetween returns [] for n <= 0 (documented edge case)", () => {
    expect(Rank.nBetween(null, null, 0)).toEqual([]);
    expect(Rank.nBetween(null, null, -3)).toEqual([]);
  });

  test("repeated squeeze toward one neighbor never collides (fractional stress)", () => {
    const lo = Rank.between(null, null);
    let hi = Rank.between(lo, null);
    // Insert 200 times between lo and the current hi, always replacing hi with
    // the new (smaller) key — the classic degenerate fractional-index pattern.
    const seen = new Set<string>([s(lo), s(hi)]);
    for (let i = 0; i < 200; i++) {
      const mid = Rank.between(lo, hi);
      expect(s(lo) < s(mid)).toBe(true);
      expect(s(mid) < s(hi)).toBe(true);
      expect(seen.has(s(mid))).toBe(false); // no collision, ever
      seen.add(s(mid));
      hi = mid;
    }
    expect(seen.size).toBe(202);
  });
});

describe("Rank — property (between sorts strictly inside, over many seeds)", () => {
  // For a random already-ordered pair (a, b) drawn from a built list, a key
  // generated between them sorts strictly between them, and inserting it keeps
  // the whole list strictly ordered. Checked over many shapes/positions.
  test("between(a,b) lands strictly between a and b for arbitrary neighbors", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rand = rng(seed);

      // Build an ordered list of 2..12 keys by appending at the tail.
      const len = 2 + Math.floor(rand() * 11);
      const list = buildList(len);
      expectStrictlyOrdered(list);

      // Pick a random adjacent gap (incl. the open head/tail ends) and insert.
      const gap = Math.floor(rand() * (len + 1)); // 0..len → before[0]..after[last]
      const prev = gap === 0 ? null : at(list, gap - 1);
      const next = gap === len ? null : at(list, gap);
      const mid = Rank.between(prev, next);

      if (prev) expect(s(prev) < s(mid)).toBe(true);
      if (next) expect(s(mid) < s(next)).toBe(true);

      const inserted = [...list.slice(0, gap), mid, ...list.slice(gap)];
      expectStrictlyOrdered(inserted); // whole list still strictly ordered
    }
  });

  test("nBetween(a,b,n) yields n ascending distinct keys strictly inside the gap", () => {
    for (let seed = 1; seed <= 1500; seed++) {
      const rand = rng(seed);
      const len = 1 + Math.floor(rand() * 8);
      const list = buildList(len);

      const gap = Math.floor(rand() * (len + 1));
      const prev = gap === 0 ? null : at(list, gap - 1);
      const next = gap === len ? null : at(list, gap);
      const n = 1 + Math.floor(rand() * 6);

      const mids = Rank.nBetween(prev, next, n);
      expect(mids.length).toBe(n);
      expect(new Set(mids.map(s)).size).toBe(n); // all distinct
      const framed = [
        ...(prev ? [prev] : []),
        ...mids,
        ...(next ? [next] : []),
      ];
      expectStrictlyOrdered(framed); // prev < mids[0] < … < mids[n-1] < next
    }
  });
});

describe("Rank — fuzz (random sequential insertion builds a total order)", () => {
  // Drive the rank API the way a real reorderable list does: start empty,
  // then repeatedly insert at a RANDOM position (head, tail, or between two
  // existing neighbors) — exactly what a DnD drop or a +task does. After every
  // insertion the list, sorted by its rank strings, must equal the intended
  // logical order; ranks must stay distinct; and `Rank.compare` must agree
  // with raw `<` at every pair. This is the whole contract under churn.
  test("intended order is always recoverable by sorting on rank string", () => {
    for (let seed = 1; seed <= 600; seed++) {
      const rand = rng(seed);

      // `logical` holds items in their intended visible order; each carries a
      // rank. Sorting by rank string must always reproduce `logical`.
      const logical: { id: number; rank: Rank }[] = [];
      const STEPS = 40;

      for (let step = 0; step < STEPS; step++) {
        const pos = Math.floor(rand() * (logical.length + 1)); // 0..len
        const prev = pos === 0 ? null : at(logical, pos - 1).rank;
        const next = pos === logical.length ? null : at(logical, pos).rank;
        const rank = Rank.between(prev, next);
        logical.splice(pos, 0, { id: step, rank });

        // 1. All ranks distinct.
        const strs = logical.map((x) => s(x.rank));
        expect(new Set(strs).size).toBe(logical.length);

        // 2. Logical order is strictly increasing in rank string.
        expectStrictlyOrdered(logical.map((x) => x.rank));

        // 3. Sorting a SHUFFLED copy by rank reproduces the logical order.
        const shuffled = [...logical].sort(() => rand() - 0.5);
        shuffled.sort((p, q) => Rank.compare(p.rank, q.rank));
        expect(shuffled.map((x) => x.id)).toEqual(logical.map((x) => x.id));

        // 4. Rank.compare agrees with raw byte comparison at every adjacent pair.
        let prevItem: { id: number; rank: Rank } | undefined = undefined;
        let prevStr: string | undefined = undefined;
        logical.forEach((item, i) => {
          const curStr = at(strs, i);
          if (prevItem !== undefined && prevStr !== undefined) {
            const cmp = Rank.compare(prevItem.rank, item.rank);
            const raw = prevStr < curStr ? -1 : prevStr > curStr ? 1 : 0;
            expect(cmp).toBe(raw);
          }
          prevItem = item;
          prevStr = curStr;
        });
      }
    }
  });
});
