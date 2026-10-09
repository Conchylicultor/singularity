import { describe, expect, test } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { planDocRanks, type DocRankSlot } from "./doc-rank";

/** Slots from `[id, key | null]` pairs, in document order. */
function slots(...pairs: [string, string | null][]): DocRankSlot[] {
  return pairs.map(([id, key]) => ({
    id,
    docRank: key === null ? null : Rank.from(key),
  }));
}

/** The keys the group holds after applying `planDocRanks`' changes. */
function applied(input: DocRankSlot[]): string[] {
  const changes = new Map(
    planDocRanks(input).map((c) => [c.id, c.to.toString()]),
  );
  return input.map((s) => changes.get(s.id) ?? s.docRank!.toString());
}

function strictlyAscending(keys: string[]): boolean {
  for (let i = 1; i < keys.length; i++) {
    if (Rank.compare(Rank.from(keys[i - 1]!), Rank.from(keys[i]!)) !== -1) {
      return false;
    }
  }
  return true;
}

/** A tiny seeded PRNG (mulberry32), so a failing case reproduces. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("planDocRanks", () => {
  test("an already-ordered group changes nothing", () => {
    expect(planDocRanks(slots(["a", "a0"], ["b", "a1"], ["c", "a2"]))).toEqual(
      [],
    );
  });

  test("an empty group changes nothing", () => {
    expect(planDocRanks([])).toEqual([]);
  });

  test("a fully unkeyed group is minted in order, from null", () => {
    const input = slots(["a", null], ["b", null], ["c", null]);
    const changes = planDocRanks(input);
    expect(changes.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(changes.every((c) => c.from === null)).toBe(true);
    expect(strictlyAscending(applied(input))).toBe(true);
  });

  test("one moved row changes exactly that row", () => {
    // `c` was dragged to the front: document order is c, a, b, d.
    const input = slots(["c", "a2"], ["a", "a0"], ["b", "a1"], ["d", "a3"]);
    const changes = planDocRanks(input);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.id).toBe("c");
    expect(strictlyAscending(applied(input))).toBe(true);
  });

  test("a NULL between kept keys is minted between them", () => {
    const input = slots(["a", "a0"], ["new", null], ["b", "a1"]);
    const changes = planDocRanks(input);
    expect(changes.map((c) => c.id)).toEqual(["new"]);
    const keys = applied(input);
    expect(strictlyAscending(keys)).toBe(true);
    expect(keys[0]).toBe("a0");
    expect(keys[2]).toBe("a1");
  });

  test("a duplicated key heals: one of the pair is re-minted", () => {
    const input = slots(["a", "a0"], ["b", "a1"], ["c", "a1"], ["d", "a2"]);
    const changes = planDocRanks(input);
    expect(changes).toHaveLength(1);
    expect(strictlyAscending(applied(input))).toBe(true);
  });

  test("a reversed group keeps one key and re-mints the rest", () => {
    const input = slots(["d", "a3"], ["c", "a2"], ["b", "a1"], ["a", "a0"]);
    expect(planDocRanks(input)).toHaveLength(3);
    expect(strictlyAscending(applied(input))).toBe(true);
  });

  test("property: output is strictly ascending, unique, and LIS-minimal", () => {
    const rand = prng(0xd0c7a4c);
    for (let round = 0; round < 400; round++) {
      const n = Math.floor(rand() * 12);
      // Draw keys from a small pool so duplicates and inversions are common.
      const pool = Rank.nBetween(null, null, 6).map((r) => r.toString());
      const input = slots(
        ...Array.from({ length: n }, (_, i): [string, string | null] => [
          `p${i}`,
          rand() < 0.2 ? null : pool[Math.floor(rand() * pool.length)]!,
        ]),
      );
      const keys = applied(input);
      expect(strictlyAscending(keys)).toBe(true);
      expect(new Set(keys).size).toBe(keys.length);

      // Minimality: the kept rows are a longest strictly increasing run of the
      // existing keys, so the change count is n − LIS (O(n²) reference).
      const existing = input.map((s) => s.docRank?.toString() ?? null);
      const best: number[] = existing.map(() => 0);
      let lis = 0;
      for (let i = 0; i < existing.length; i++) {
        if (existing[i] === null) continue;
        best[i] = 1;
        for (let j = 0; j < i; j++) {
          if (existing[j] !== null && existing[j]! < existing[i]!) {
            best[i] = Math.max(best[i]!, best[j]! + 1);
          }
        }
        lis = Math.max(lis, best[i]!);
      }
      expect(planDocRanks(input)).toHaveLength(n - lis);

      // Idempotent: the planned group plans nothing.
      const settled = input.map((s, i) => ({
        id: s.id,
        docRank: Rank.from(keys[i]!),
      }));
      expect(planDocRanks(settled)).toEqual([]);
    }
  });
});
