/**
 * The segmented scroll's plan, against a simulated server: a total order of
 * rows (each row's key is its position's text, so cuts compare like the real
 * `$key`), and every segment's window answered instantly as Postgres would —
 * the first `limit` rows of `(after, until]`. The plan is driven to a fixpoint
 * after each step, as `useLiveScroll` drives it (one reconcile per render).
 *
 * Run: `./singularity test plugins/network/plugins/live`.
 */

import { describe, expect, test } from "bun:test";
import {
  assemble,
  growTail,
  MAX_SCROLL_SEGMENTS,
  reconcile,
  startScroll,
  TRUNCATION_DETAIL,
  type ScrollLimits,
  type ScrollState,
  type Segment,
  type SegmentObservation,
} from "./scroll-plan";

const LIMITS: ScrollLimits = { step: 2, maxLimit: 6 }; // H 2, M 6, T 2

/** A row in the order: `rank` places it; `key` is null for an un-cuttable row. */
interface SimRow {
  id: string;
  rank: number;
  cuttable: boolean;
}

class Server {
  rows: SimRow[] = [];
  /** Reads that fail, by segment signature. */
  failing = new Set<string>();
  /** Reads with no answer yet. */
  withholding = new Set<string>();
  /** The last answer each segment got, for a failing read's stale rows. */
  lastAnswer = new Map<string, SimRow[]>();

  constructor(ranks: number[]) {
    for (const r of ranks) this.insert(r);
  }
  insert(rank: number, cuttable = true): void {
    this.rows.push({ id: `r${rank}`, rank, cuttable });
    this.rows.sort((a, b) => a.rank - b.rank);
  }
  delete(rank: number): void {
    this.rows = this.rows.filter((r) => r.rank !== rank);
  }
  static keyOf(r: SimRow): string {
    return JSON.stringify([String(r.rank).padStart(8, "0"), r.id]);
  }
  static rankOf(key: string): number {
    return Number((JSON.parse(key) as string[])[0]);
  }
  window(seg: Segment): SimRow[] {
    return this.rows
      .filter(
        (r) =>
          (seg.after === null || r.rank > Server.rankOf(seg.after)) &&
          (seg.until === null || r.rank <= Server.rankOf(seg.until)),
      )
      .slice(0, seg.limit);
  }
  observe = (seg: Segment): SegmentObservation => {
    const sig = JSON.stringify(seg);
    if (this.withholding.has(sig)) return { kind: "pending" };
    if (this.failing.has(sig)) {
      const stale = this.lastAnswer.get(sig);
      const error = new Error(`read failed: ${sig}`);
      return stale === undefined
        ? { kind: "failed", error }
        : { kind: "settled", entries: entries(stale), error };
    }
    const rows = this.window(seg);
    this.lastAnswer.set(sig, rows);
    return { kind: "settled", entries: entries(rows), error: null };
  };
}

const entries = (rows: SimRow[]) =>
  rows.map((r) => ({ id: r.id, key: r.cuttable ? Server.keyOf(r) : null }));

/** Reconcile to a fixpoint (bounded), collecting every collapse reason. */
function settle(
  server: Server,
  state: ScrollState,
): { state: ScrollState; collapses: string[] } {
  const collapses: string[] = [];
  for (let i = 0; i < 200; i++) {
    const out = reconcile(state, server.observe, LIMITS);
    if (out.collapsed) collapses.push(out.collapsed.reason);
    if (out.state === state) return { state, collapses };
    state = out.state;
  }
  throw new Error("the plan did not reach a fixpoint");
}

const ids = (server: Server, state: ScrollState) =>
  assemble(state, server.observe, LIMITS).entries.map((e) => e.id);
const truth = (server: Server, n: number) =>
  server.rows.slice(0, n).map((r) => r.id);
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => from + i);

/** The rows up to and including the first full bounded segment: must be a prefix of the order. */
function prefixIds(server: Server, state: ScrollState): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const seg of state.committed) {
    const o = server.observe(seg);
    if (o.kind !== "settled") break;
    for (const e of o.entries) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e.id);
      }
    }
    if (seg.until !== null && o.entries.length === seg.limit) break;
  }
  return out;
}

describe("scroll plan — the tail", () => {
  test("starts at one step, grows by a step to maxLimit, then splits with S2 = 2·step", () => {
    const server = new Server(range(0, 20));
    let { state } = settle(server, startScroll(LIMITS));
    expect(state.committed).toEqual([{ after: null, until: null, limit: 2 }]);
    expect(assemble(state, server.observe, LIMITS).canGrow).toBe(true);

    for (const limit of [4, 6]) {
      state = growTail(state, server.observe, LIMITS);
      expect(state.change?.growing).toBe(true);
      // The handoff: the old rows stay the assembled ones until it settles.
      expect(ids(server, state)).toEqual(truth(server, limit - 2));
      state = settle(server, state).state;
      expect(state.committed).toEqual([{ after: null, until: null, limit }]);
    }
    // At maxLimit, a loadMore splits the tail at row M − H.
    state = settle(server, growTail(state, server.observe, LIMITS)).state;
    const cut = Server.keyOf(server.rows[3]!);
    expect(state.committed).toEqual([
      { after: null, until: cut, limit: 6 },
      { after: cut, until: null, limit: 4 },
    ]);
    expect(ids(server, state)).toEqual(truth(server, 8));
    const a = assemble(state, server.observe, LIMITS);
    expect(a.canGrow).toBe(true);
    expect(a.exhausted).toBe(false);
  });

  test("a tail that is not full is exhausted and cannot grow", () => {
    const server = new Server(range(0, 3));
    let { state } = settle(server, startScroll(LIMITS));
    state = settle(server, growTail(state, server.observe, LIMITS)).state;
    const a = assemble(state, server.observe, LIMITS);
    expect(a.entries).toHaveLength(3);
    expect(a.exhausted).toBe(true);
    expect(a.canGrow).toBe(false);
    // A loadMore on a non-full tail does nothing.
    expect(growTail(state, server.observe, LIMITS)).toBe(state);
  });
});

describe("scroll plan — bounded segments", () => {
  function twoSegments(server: Server): ScrollState {
    let { state } = settle(server, startScroll(LIMITS));
    for (let i = 0; i < 3; i++) {
      state = settle(server, growTail(state, server.observe, LIMITS)).state;
    }
    expect(state.committed).toHaveLength(2);
    return state;
  }

  test("a bounded segment that fills grows, then splits at maxLimit — the prefix stays gap-free", () => {
    const server = new Server(range(0, 40).map((r) => r * 10));
    let state = twoSegments(server);
    // Rows inserted INSIDE the bounded segments' ranges (the cut is rank 30):
    // segment 0 is at maxLimit, so it splits; the (15, 30] half it leaves at
    // 2·step then fills, grows, and splits in turn.
    const limitsSeen = new Set<number>();
    for (const rank of [5, 15, 16, 17, 18, 19, 21, 22, 23, 24]) {
      server.insert(rank);
      state = settle(server, state).state;
      for (const seg of state.committed) {
        if (seg.until !== null) limitsSeen.add(seg.limit);
      }
      expect(prefixIds(server, state)).toEqual(
        truth(server, prefixIds(server, state).length),
      );
    }
    // A bounded segment grew (2·step → maxLimit) and split.
    expect(limitsSeen.has(LIMITS.maxLimit)).toBe(true);
    expect(state.committed.length).toBeGreaterThan(3);
    for (const seg of state.committed) {
      expect(seg.limit).toBeLessThanOrEqual(LIMITS.maxLimit);
    }
    expect(ids(server, state)).toEqual(
      truth(server, ids(server, state).length),
    );
  });

  test("merge: two neighbours holding ≤ maxLimit − 2·step rows become one at rows + step", () => {
    const server = new Server(range(0, 20));
    let state = twoSegments(server);
    // Delete down to one row in each of the two segments.
    const cut = Server.rankOf(state.committed[0]!.until!);
    for (const r of range(1, cut + 1)) server.delete(r);
    for (const r of range(cut + 2, 20)) server.delete(r);
    state = settle(server, state).state;
    expect(state.committed).toEqual([{ after: null, until: null, limit: 4 }]);
    expect(ids(server, state)).toEqual(["r0", `r${cut + 1}`]);
  });

  test("empty fold: a segment left with no rows merges into its predecessor at once, whatever the threshold", () => {
    const server = new Server(range(0, 20));
    let state = twoSegments(server);
    const cut = Server.rankOf(state.committed[0]!.until!);
    for (const r of range(cut + 1, 20)) server.delete(r);
    state = settle(server, state).state;
    expect(state.committed).toEqual([{ after: null, until: null, limit: 6 }]);
    // Its four rows no longer fill it: nothing is past them.
    expect(assemble(state, server.observe, LIMITS).exhausted).toBe(true);
  });

  test("empty fold of the head merges it into its successor", () => {
    const server = new Server(range(0, 20));
    let state = twoSegments(server);
    const cut = Server.rankOf(state.committed[0]!.until!);
    for (const r of range(0, cut + 1)) server.delete(r);
    state = settle(server, state).state;
    expect(state.committed[0]!.after).toBeNull();
    expect(ids(server, state)).toEqual(
      truth(server, ids(server, state).length),
    );
  });

  test("the handoff: replaced segments stay assembled until every replacement settles", () => {
    const server = new Server(range(0, 20));
    let { state } = settle(server, startScroll(LIMITS));
    state = growTail(state, server.observe, LIMITS);
    server.withholding.add(JSON.stringify(state.change!.next[0]));
    expect(settle(server, state).state).toBe(state);
    expect(ids(server, state)).toEqual(["r0", "r1"]);
    server.withholding.clear();
    state = settle(server, state).state;
    expect(ids(server, state)).toEqual(truth(server, 4));
  });

  test("a failed page past the tail keeps its old rows, set aside with a failure that stops paging", () => {
    const server = new Server(range(0, 20));
    let { state } = settle(server, startScroll(LIMITS));
    state = growTail(state, server.observe, LIMITS);
    const failing = state.change!.next[0]!;
    server.failing.add(JSON.stringify(failing));
    state = settle(server, state).state;
    // Set aside, not held open — and kept (nothing else would re-ask for it).
    expect(state.change).toBeNull();
    expect(state.stalled?.next).toEqual([failing]);
    const a = assemble(state, server.observe, LIMITS);
    expect(a.entries.map((e) => e.id)).toEqual(["r0", "r1"]);
    expect(a.growing).toBe(false);
    expect(a.failures).toHaveLength(1);
    expect(a.failures[0]!.failed).toEqual(failing);
    expect(a.failures[0]!.index).toBe(0);
    expect(a.failures[0]!.blocksPaging).toBe(true);
    // A retry that succeeds commits the change.
    server.failing.clear();
    state = settle(server, state).state;
    expect(ids(server, state)).toEqual(truth(server, 4));
    expect(state.stalled).toBeNull();
  });

  test("a failed bounded replacement is set aside: the error is what holds the scroll, never a silent dead end", () => {
    const server = new Server(range(0, 40).map((r) => r * 10));
    let state = twoSegments(server);
    state = settle(server, growTail(state, server.observe, LIMITS)).state;
    expect(state.committed).toHaveLength(2);
    // New rows fill the bounded head; the step that re-establishes the
    // prefix (its split) fails.
    server.insert(5);
    server.insert(15);
    const step = reconcile(state, server.observe, LIMITS).state;
    expect(step.change).not.toBeNull();
    server.failing.add(JSON.stringify(step.change!.next[0]));
    state = settle(server, step).state;
    expect(state.change).toBeNull();
    expect(state.stalled).toEqual(step.change);
    let a = assemble(state, server.observe, LIMITS);
    // The head is full and bounded: the prefix ends there, so paging stops —
    // on the failure, which says so.
    expect(a.canGrow).toBe(false);
    expect(a.exhausted).toBe(false);
    expect(a.growing).toBe(false);
    expect(a.failures.map((f) => f.blocksPaging)).toEqual([true]);
    // Held, not re-minted onto the same failing read.
    expect(reconcile(state, server.observe, LIMITS).state).toBe(state);
    // The server answers again: the set-aside change commits, the scroll moves on.
    server.failing.clear();
    state = settle(server, state).state;
    a = assemble(state, server.observe, LIMITS);
    expect(a.failures).toEqual([]);
    expect(state.stalled).toBeNull();
    expect(prefixIds(server, state)).toEqual(
      truth(server, prefixIds(server, state).length),
    );
  });

  test("a failed merge of two middle segments does not stop paging: the tail grows past it", () => {
    const server = new Server(range(0, 40));
    let { state } = settle(server, startScroll(LIMITS));
    while (state.committed.length < 3) {
      state = settle(server, growTail(state, server.observe, LIMITS)).state;
    }
    // Empty the first two segments down to one row each: they call for a merge.
    const c1 = Server.rankOf(state.committed[0]!.until!);
    const c2 = Server.rankOf(state.committed[1]!.until!);
    for (const r of range(1, c1 + 1)) server.delete(r);
    for (const r of range(c1 + 2, c2 + 1)) server.delete(r);
    const merge = reconcile(state, server.observe, LIMITS).state;
    expect(merge.change).toMatchObject({ from: 0, to: 1 });
    server.failing.add(JSON.stringify(merge.change!.next[0]));
    state = settle(server, merge).state;
    expect(state.stalled).toEqual(merge.change);
    const a = assemble(state, server.observe, LIMITS);
    expect(a.failures.map((f) => [f.index, f.blocksPaging])).toEqual([
      [0, false],
    ]);
    expect(a.canGrow).toBe(true);
    const grown = growTail(state, server.observe, LIMITS);
    expect(grown.change?.growing).toBe(true);
    // The page supersedes the set-aside merge (re-minted after it, if still needed).
    expect(grown.stalled).toBeNull();
  });

  test("a middle segment's error does not stop paging: the tail can still grow", () => {
    const server = new Server(range(0, 30));
    let { state } = settle(server, startScroll(LIMITS));
    for (let i = 0; i < 4; i++) {
      state = settle(server, growTail(state, server.observe, LIMITS)).state;
    }
    expect(state.committed.length).toBeGreaterThanOrEqual(2);
    server.observe(state.committed[0]!); // remember its last answer
    server.failing.add(JSON.stringify(state.committed[0]));
    const a = assemble(state, server.observe, LIMITS);
    expect(a.failures.map((f) => f.index)).toEqual([0]);
    expect(a.canGrow).toBe(true);
  });

  test("dedup: a row two segments both answer with is assembled once, first wins", () => {
    const state: ScrollState = {
      committed: [
        { after: null, until: "k", limit: 6 },
        { after: "k", until: null, limit: 4 },
      ],
      change: null,
      stalled: null,
    };
    const observe = (seg: Segment): SegmentObservation => ({
      kind: "settled",
      error: null,
      entries:
        seg.until === "k"
          ? [
              { id: "a", key: "1" },
              { id: "b", key: "2" },
            ]
          : [
              { id: "b", key: "2" },
              { id: "c", key: "3" },
            ],
    });
    expect(assemble(state, observe, LIMITS).entries.map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("scroll plan — the progress guard and the cap", () => {
  test("a split whose cut row has no key collapses, and the tail says it is truncated", () => {
    const server = new Server([]);
    for (const r of range(0, 12)) server.insert(r, r !== 3);
    let { state } = settle(server, startScroll(LIMITS));
    for (let i = 0; i < 2; i++) {
      state = settle(server, growTail(state, server.observe, LIMITS)).state;
    }
    // At maxLimit, the cut row (index M − H − 1 = 3) cannot be cut at.
    expect(growTail(state, server.observe, LIMITS)).toBe(state);
    const a = assemble(state, server.observe, LIMITS);
    expect(a.truncated).toBe("long-sort-key");
    expect(a.canGrow).toBe(false);
  });

  test("a bounded split with no key collapses the segments after it and reports why", () => {
    const server = new Server(range(0, 40).map((r) => r * 10));
    let { state } = settle(server, startScroll(LIMITS));
    for (let i = 0; i < 3; i++) {
      state = settle(server, growTail(state, server.observe, LIMITS)).state;
    }
    expect(state.committed).toHaveLength(2);
    // Fill segment 0 past maxLimit with rows whose keys are too long.
    let collapses: string[] = [];
    for (const rank of [1, 2, 3, 4, 5, 6]) {
      server.insert(rank, false);
      const out = settle(server, state);
      state = out.state;
      collapses = [...collapses, ...out.collapses];
    }
    expect(collapses).toContain(TRUNCATION_DETAIL["long-sort-key"]);
    expect(state.committed).toHaveLength(1);
    expect(state.committed[0]).toEqual({ after: null, until: null, limit: 6 });
    expect(prefixIds(server, state)).toEqual(truth(server, 6));
  });

  test("a head that keeps filling at the cap stays a gap-free prefix at every step, and ends collapsed rather than hiding rows", () => {
    // Build K = 16 segments by scrolling deep, then keep inserting at the
    // order's start — every insert lands in the head.
    const server = new Server(range(0, 400).map((r) => 1000 + r * 4));
    let { state } = settle(server, startScroll(LIMITS));
    for (let i = 0; i < 200; i++) {
      const next = growTail(state, server.observe, LIMITS);
      if (next === state) break;
      state = settle(server, next).state;
    }
    expect(state.committed.length).toBe(MAX_SCROLL_SEGMENTS);
    expect(assemble(state, server.observe, LIMITS).truncated).toBe(
      "segment-cap",
    );
    let collapsed = 0;
    for (let rank = 999; rank > 0 && collapsed === 0; rank--) {
      server.insert(rank);
      const out = settle(server, state);
      state = out.state;
      collapsed += out.collapses.length;
      expect(state.committed.length).toBeLessThanOrEqual(MAX_SCROLL_SEGMENTS);
      const prefix = prefixIds(server, state);
      expect(prefix).toEqual(truth(server, prefix.length));
    }
    expect(collapsed).toBeGreaterThan(0);
    // Collapsed to the head: every row it renders is the true prefix, and it can page again.
    const a = assemble(state, server.observe, LIMITS);
    expect(a.entries.map((e) => e.id)).toEqual(truth(server, a.entries.length));
    expect(a.canGrow).toBe(true);
  });
});
