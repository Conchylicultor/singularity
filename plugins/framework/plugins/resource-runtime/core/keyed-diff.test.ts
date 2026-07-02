/**
 * Tests for the SERVER-side keyed-delta diff core. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/keyed-diff.test.ts`.
 *
 * This is the producer of the `(upserts, deletes, order)` deltas the client
 * `mergeKeyedDelta` consumes. The round-trip property (producer ⟷ consumer
 * agree on one contract) lives in the live-state plugin
 * (`keyed-diff-roundtrip.test.ts`) — it needs both halves, and the import
 * direction only allows live-state to depend on resource-runtime, never the
 * reverse. This file tests the diff's standalone invariants:
 *
 *   - `order` is asserted IFF membership/order changed; omitted strictly means
 *     "in-place upserts, membership unchanged" ⇒ then `deletes` is empty AND no
 *     new ids appear.
 *   - `upserts` = exactly the rows whose content-hash changed plus the new rows.
 *   - `deletes` = exactly the ids removed since the prior snapshot.
 *   - The scoped (Layer-2) variant NEVER asserts order/deletes; membership stays
 *     FULL. Its upserts are exactly the changed rows in the partial input.
 *   - Both functions are pure: they never mutate the prior snapshot.
 */

import { test, expect, describe } from "bun:test";
import {
  buildSnapshot,
  diffKeyedFull,
  diffKeyedScoped,
  type KeyedSnapshot,
} from "./keyed-diff";
// mulberry32 PRNG is single-sourced in test-support (deduped from here).
import { rng } from "./test-support";

type Row = { id: string; v: number };
const keyOf = (r: unknown) => (r as Row).id;
const snapOf = (rows: Row[]): Map<string, string> => buildSnapshot(rows, keyOf);

describe("diffKeyedFull — scenarios", () => {
  test("first notify (no prior snapshot): hadSnapshot false, all rows upserted, order asserted", () => {
    const { diff, nextSnapshot } = diffKeyedFull(undefined, [{ id: "A", v: 1 }, { id: "B", v: 1 }], keyOf);
    expect(diff.hadSnapshot).toBe(false);
    expect(diff.upserts.map(([id]) => id)).toEqual(["A", "B"]);
    expect(diff.deletes).toEqual([]);
    expect(diff.order).toEqual(["A", "B"]);
    expect([...nextSnapshot.keys()]).toEqual(["A", "B"]);
  });

  test("in-place content change: order omitted, deletes empty, only changed row upserted", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }]);
    const { diff } = diffKeyedFull(prev, [{ id: "A", v: 1 }, { id: "B", v: 2 }], keyOf);
    expect(diff.order).toBeUndefined();
    expect(diff.deletes).toEqual([]);
    expect(diff.upserts).toEqual([["B", { id: "B", v: 2 }]]);
    expect(diff.hadSnapshot).toBe(true);
  });

  test("no change at all: order omitted, no upserts, no deletes", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }]);
    const { diff } = diffKeyedFull(prev, [{ id: "A", v: 1 }, { id: "B", v: 1 }], keyOf);
    expect(diff.order).toBeUndefined();
    expect(diff.upserts).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  test("membership add: order asserted, new row upserted, deletes empty", () => {
    const prev = snapOf([{ id: "A", v: 1 }]);
    const { diff } = diffKeyedFull(prev, [{ id: "A", v: 1 }, { id: "B", v: 1 }], keyOf);
    expect(diff.order).toEqual(["A", "B"]);
    expect(diff.upserts).toEqual([["B", { id: "B", v: 1 }]]);
    expect(diff.deletes).toEqual([]);
  });

  test("membership delete: order asserted, deletes names the removed id, no upserts", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }]);
    const { diff } = diffKeyedFull(prev, [{ id: "A", v: 1 }], keyOf);
    expect(diff.order).toEqual(["A"]);
    expect(diff.deletes).toEqual(["B"]);
    expect(diff.upserts).toEqual([]);
  });

  test("pure reorder (no content change): order asserted, no upserts, no deletes", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }, { id: "C", v: 1 }]);
    const { diff } = diffKeyedFull(prev, [{ id: "C", v: 1 }, { id: "A", v: 1 }, { id: "B", v: 1 }], keyOf);
    expect(diff.order).toEqual(["C", "A", "B"]);
    expect(diff.upserts).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  test("does not mutate the prior snapshot", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }]);
    const before = new Map(prev);
    diffKeyedFull(prev, [{ id: "A", v: 9 }], keyOf);
    expect(prev).toEqual(before);
  });
});

describe("diffKeyedScoped — scenarios", () => {
  test("never asserts order/deletes; upserts only the changed partial rows", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }, { id: "C", v: 1 }]);
    // Partial recompute: only B and C were recomputed; B changed, C didn't.
    const { upserts, nextSnapshot } = diffKeyedScoped(prev, [{ id: "B", v: 2 }, { id: "C", v: 1 }], keyOf);
    expect(upserts).toEqual([["B", { id: "B", v: 2 }]]);
    // Snapshot still has all three ids, A and C untouched, B updated.
    expect([...nextSnapshot.keys()]).toEqual(["A", "B", "C"]);
    expect(nextSnapshot.get("B")).toBe(JSON.stringify({ id: "B", v: 2 }));
    expect(nextSnapshot.get("A")).toBe(JSON.stringify({ id: "A", v: 1 }));
  });

  test("does not mutate the prior snapshot", () => {
    const prev = snapOf([{ id: "A", v: 1 }, { id: "B", v: 1 }]);
    const before = new Map(prev);
    diffKeyedScoped(prev, [{ id: "B", v: 5 }], keyOf);
    expect(prev).toEqual(before);
  });
});

// A random list of rows over a small id universe with random versions.
function randomRows(rand: () => number, ids: string[]): Row[] {
  return ids
    .filter(() => rand() < 0.6)
    .map((id) => ({ id, v: Math.floor(rand() * 4) }))
    // shuffle so order varies independently of membership
    .sort(() => rand() - 0.5);
}

describe("diffKeyedFull — property (random prev→next transitions)", () => {
  // For arbitrary prev/next lists, every wire invariant holds, derived directly
  // from the two snapshots (no reimplementation of the diff's internals).
  test("order iff membership/order changed; deletes=removed; upserts=changed∪new", () => {
    let checks = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const rand = rng(seed);
      const ids = ["A", "B", "C", "D", "E"];

      // ~15% of runs exercise the first-notify (no prior snapshot) path.
      const firstNotify = rand() < 0.15;
      const prevRows = firstNotify ? null : randomRows(rand, ids);
      const prev: KeyedSnapshot | undefined = prevRows ? snapOf(prevRows) : undefined;
      const nextRows = randomRows(rand, ids);

      const { diff, nextSnapshot } = diffKeyedFull(prev, nextRows, keyOf);

      const prevById = new Map((prevRows ?? []).map((r) => [r.id, JSON.stringify(r)]));
      const prevOrder = prevRows ? prevRows.map((r) => r.id) : undefined;
      const nextOrder = nextRows.map((r) => r.id);

      // hadSnapshot mirrors whether a prior snapshot existed.
      expect(diff.hadSnapshot).toBe(prev !== undefined);

      // --- order: asserted IFF membership/order changed (vs prior) ---
      const orderChanged =
        prevOrder === undefined ||
        prevOrder.length !== nextOrder.length ||
        prevOrder.some((id, i) => id !== nextOrder[i]);
      if (orderChanged) {
        expect(diff.order).toEqual(nextOrder);
      } else {
        expect(diff.order).toBeUndefined();
        // Omitted order strictly means membership unchanged ⇒ no deletes, no new ids.
        expect(diff.deletes).toEqual([]);
        for (const [id] of diff.upserts) expect(prevById.has(id)).toBe(true);
      }

      // --- deletes: exactly the ids in prev absent from next ---
      const expectedDeletes = [...prevById.keys()].filter((id) => !nextOrder.includes(id));
      expect([...diff.deletes].sort()).toEqual(expectedDeletes.sort());

      // --- upserts: exactly the rows whose hash differs from prev (or are new) ---
      const expectedUpsertIds = nextRows
        .filter((r) => prevById.get(r.id) !== JSON.stringify(r))
        .map((r) => r.id);
      expect(diff.upserts.map(([id]) => id).sort()).toEqual(expectedUpsertIds.sort());
      // Every upsert carries the actual current row object.
      for (const [id, row] of diff.upserts) {
        expect(JSON.stringify(row)).toBe(JSON.stringify(nextRows.find((r) => r.id === id)));
      }

      // --- nextSnapshot reflects the new array exactly (id order + hashes) ---
      expect([...nextSnapshot.keys()]).toEqual(nextOrder);
      for (const r of nextRows) expect(nextSnapshot.get(r.id)).toBe(JSON.stringify(r));

      checks++;
    }
    expect(checks).toBe(3000);
  });
});

describe("diffKeyedScoped — property (random partial recomputes)", () => {
  test("upserts = exactly changed partial rows; snapshot merges, prev untouched, no order/deletes", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rand = rng(seed);
      const ids = ["A", "B", "C", "D", "E"];
      const baseRows = ids
        .filter(() => rand() < 0.7)
        .map((id) => ({ id, v: Math.floor(rand() * 4) }));
      if (baseRows.length === 0) continue;
      const prev = snapOf(baseRows);
      const prevCopy = new Map(prev);

      // Partial recompute: a random subset of the base ids, each possibly changed.
      const scoped: Row[] = baseRows
        .filter(() => rand() < 0.5)
        .map((r) => ({ id: r.id, v: rand() < 0.5 ? r.v : r.v + 10 }));

      const { upserts, nextSnapshot } = diffKeyedScoped(prev, scoped, keyOf);

      // prev never mutated.
      expect(prev).toEqual(prevCopy);

      // upserts = exactly the scoped rows whose hash differs from prev.
      const expected = scoped
        .filter((r) => prevCopy.get(r.id) !== JSON.stringify(r))
        .map((r) => [r.id, r] as [string, Row]);
      expect(upserts.map(([id]) => id)).toEqual(expected.map(([id]) => id));
      for (const [id, row] of upserts) {
        expect(JSON.stringify(row)).toBe(JSON.stringify(scoped.find((r) => r.id === id)));
      }

      // Membership preserved: nextSnapshot keys = prev keys (scoped never adds/removes).
      expect([...nextSnapshot.keys()].sort()).toEqual([...prevCopy.keys()].sort());
      // Untouched ids keep their prior hash; scoped-changed ids get the new hash.
      for (const id of prevCopy.keys()) {
        const scopedRow = scoped.find((r) => r.id === id);
        const expectedHash =
          scopedRow && prevCopy.get(id) !== JSON.stringify(scopedRow)
            ? JSON.stringify(scopedRow)
            : prevCopy.get(id);
        expect(nextSnapshot.get(id)).toBe(expectedHash);
      }
    }
  });
});
