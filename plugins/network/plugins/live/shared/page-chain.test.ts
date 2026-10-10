import { describe, expect, test } from "bun:test";
import {
  assembleChain,
  chainSpecs,
  growChain,
  MAX_LIVE_PAGES,
  reconcileChain,
  startChain,
  type PageChainState,
  type PageObservation,
  type PageSpec,
} from "./page-chain";

interface Item {
  id: string;
}
type Obs = PageObservation<Item, { total: number }>;

const LIMIT = 3;
const idOf = (i: Item) => i.id;
const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));

/** Observations keyed by a page's cursor and size; an unknown page is pending. */
function world(pages: Record<string, Obs>) {
  return (spec: PageSpec): Obs =>
    pages[`${spec.cursor ?? "-"}/${spec.limit}`] ?? { kind: "pending" };
}
const settled = (ids: string[], nextCursor: string | null, total = 0): Obs => ({
  kind: "settled",
  page: { items: items(...ids), nextCursor, meta: { total } },
  error: null,
});

describe("page chain", () => {
  test("the first page is asked at `first`, later pages at the limit, only after a grow", () => {
    let chain = startChain(2);
    expect(chainSpecs(chain)).toEqual([{ cursor: null, limit: 2 }]);
    const observe = world({ "-/2": settled(["a", "b"], "c1", 7) });
    expect(reconcileChain(chain, observe, LIMIT)).toBe(chain);
    const a = assembleChain(chain, observe, idOf);
    expect(a).toEqual({
      kind: "ready",
      items: items("a", "b"),
      meta: { total: 7 },
      canGrow: true,
      growing: false,
      truncated: false,
    });
    chain = growChain(chain, observe, LIMIT);
    expect(chainSpecs(chain)).toEqual([
      { cursor: null, limit: 2 },
      { cursor: "c1", limit: LIMIT },
    ]);
    // The grown page is loading: the items before it stand.
    expect(assembleChain(chain, observe, idOf)).toMatchObject({
      kind: "ready",
      items: items("a", "b"),
      growing: true,
      canGrow: false,
    });
  });

  test("loading until the first page answers; a grow before then is a no-op", () => {
    const chain = startChain(LIMIT);
    const observe = world({});
    expect(assembleChain(chain, observe, idOf)).toEqual({ kind: "loading" });
    expect(growChain(chain, observe, LIMIT)).toBe(chain);
  });

  test("the last page (nextCursor null) cannot grow", () => {
    const chain = startChain(LIMIT);
    const observe = world({ "-/3": settled(["a"], null) });
    expect(growChain(chain, observe, LIMIT)).toBe(chain);
    expect(assembleChain(chain, observe, idOf)).toMatchObject({
      canGrow: false,
      truncated: false,
    });
  });

  test("a changed nextCursor re-mints the successor, keeping the old page until the new one settles", () => {
    const chain: PageChainState = {
      slots: [
        { spec: { cursor: null, limit: LIMIT }, previous: null },
        { spec: { cursor: "c1", limit: LIMIT }, previous: null },
      ],
    };
    // Page 0 refreshed: a new row pushed the boundary — its next cursor moved.
    const moved = world({
      "-/3": settled(["n", "a", "b"], "c1b"),
      "c1/3": settled(["c", "d"], null),
    });
    const next = reconcileChain(chain, moved, LIMIT);
    expect(next.slots[1]).toEqual({
      spec: { cursor: "c1b", limit: LIMIT },
      previous: { cursor: "c1", limit: LIMIT },
    });
    // Idempotent.
    expect(reconcileChain(next, moved, LIMIT)).toBe(next);
    // Both tuples are read while the handoff runs.
    expect(chainSpecs(next)).toHaveLength(3);
    // The old page is still rendered — never back to loading.
    expect(assembleChain(next, moved, idOf)).toMatchObject({
      kind: "ready",
      items: items("n", "a", "b", "c", "d"),
    });
    // The replacement settles: the old page is released.
    const landed = world({
      "-/3": settled(["n", "a", "b"], "c1b"),
      "c1b/3": settled(["c", "d"], null),
      "c1/3": settled(["c", "d"], null),
    });
    const done = reconcileChain(next, landed, LIMIT);
    expect(done.slots[1]).toEqual({
      spec: { cursor: "c1b", limit: LIMIT },
      previous: null,
    });
    expect(chainSpecs(done)).toHaveLength(2);
  });

  test("a predecessor that now ends the chain drops the pages after it", () => {
    const chain: PageChainState = {
      slots: [
        { spec: { cursor: null, limit: LIMIT }, previous: null },
        { spec: { cursor: "c1", limit: LIMIT }, previous: null },
      ],
    };
    const shrunk = world({ "-/3": settled(["a"], null) });
    expect(reconcileChain(chain, shrunk, LIMIT).slots).toHaveLength(1);
  });

  test("a predecessor still loading holds the walk", () => {
    const chain: PageChainState = {
      slots: [
        { spec: { cursor: null, limit: LIMIT }, previous: null },
        { spec: { cursor: "c1", limit: LIMIT }, previous: null },
      ],
    };
    expect(reconcileChain(chain, world({}), LIMIT)).toBe(chain);
  });

  test("an item that shifted across a boundary is shown once — the first occurrence", () => {
    const chain: PageChainState = {
      slots: [
        { spec: { cursor: null, limit: LIMIT }, previous: null },
        { spec: { cursor: "c1", limit: LIMIT }, previous: null },
      ],
    };
    const observe = world({
      "-/3": settled(["a", "b", "c"], "c1"),
      "c1/3": settled(["c", "d"], null),
    });
    expect(assembleChain(chain, observe, idOf)).toMatchObject({
      items: items("a", "b", "c", "d"),
    });
  });

  test("a failed grow is the error arm with every item held as stale", () => {
    const chain: PageChainState = {
      slots: [
        { spec: { cursor: null, limit: LIMIT }, previous: null },
        { spec: { cursor: "c1", limit: LIMIT }, previous: null },
      ],
    };
    const err = new Error("boom");
    const observe = world({
      "-/3": settled(["a", "b", "c"], "c1", 9),
      "c1/3": { kind: "failed", error: err },
    });
    expect(assembleChain(chain, observe, idOf)).toEqual({
      kind: "error",
      error: err,
      failing: { cursor: "c1", limit: LIMIT },
      stale: items("a", "b", "c"),
      meta: { total: 9 },
    });
  });

  test("a first page that failed with nothing to show has no stale", () => {
    const err = new Error("boom");
    const a = assembleChain(
      startChain(LIMIT),
      world({ "-/3": { kind: "failed", error: err } }),
      idOf,
    );
    expect(a).toEqual({
      kind: "error",
      error: err,
      failing: { cursor: null, limit: LIMIT },
    });
  });

  test("the cap stops growth and says truncated", () => {
    const pages: Record<string, Obs> = {};
    const slots = [];
    for (let k = 0; k < MAX_LIVE_PAGES; k++) {
      const cursor = k === 0 ? null : `c${k}`;
      slots.push({ spec: { cursor, limit: LIMIT }, previous: null });
      pages[`${cursor ?? "-"}/${LIMIT}`] = settled([`i${k}`], `c${k + 1}`);
    }
    const chain: PageChainState = { slots };
    const observe = world(pages);
    expect(growChain(chain, observe, LIMIT)).toBe(chain);
    expect(assembleChain(chain, observe, idOf)).toMatchObject({
      kind: "ready",
      canGrow: false,
      truncated: true,
    });
  });
});
