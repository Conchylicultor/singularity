import { describe, it, expect } from "bun:test";
import type { TraceSnapshot } from "@plugins/debug/plugins/trace/plugins/engine/core";
import {
  buildSpanTree,
  crossLayerUnionMs,
  flattenTree,
  ancestorChain,
  type SpanTreeResult,
} from "./build-tree";

// A minimal v2 snapshot with a spans flight window. windowStartMs=1000, atMs=2000
// → a 1000ms window.
function snapshot(spans: unknown): TraceSnapshot {
  return {
    v: 2,
    id: "t1",
    atMs: 2000,
    wallTime: "2026-07-09T00:00:00.000Z",
    worktree: "wt",
    windowStartMs: 1000,
    trigger: { kind: "loader", label: "x", durationMs: 900, thresholdMs: 500 },
    events: { spans },
  };
}

function span(over: Partial<Record<string, unknown>>) {
  return {
    id: 1,
    parentId: null,
    kind: "loader",
    label: "load-x",
    t0: 1200,
    t1: 1800,
    ageMs: 600,
    waitMs: 0,
    childMs: 0,
    selfMs: 600,
    ...over,
  };
}

function ok(result: SpanTreeResult) {
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  return result;
}

describe("buildSpanTree — section outcomes", () => {
  it("reports an absent section", () => {
    expect(buildSpanTree(snapshot(undefined)).kind).toBe("absent");
  });

  it("reports a legacy (pre-id) payload distinctly from corruption", () => {
    const legacy = {
      atMs: 2000,
      open: [],
      completed: [
        { kind: "loader", label: "l", t0: 1200, t1: 1800, ageMs: 600, parents: [], waitMs: 0, childMs: 0, selfMs: 600 },
      ],
    };
    expect(buildSpanTree(snapshot(legacy)).kind).toBe("legacy");
  });

  it("reports a corrupt payload as invalid, with a message", () => {
    const result = buildSpanTree(snapshot({ bogus: true }));
    if (result.kind !== "invalid") throw new Error(`expected invalid, got ${result.kind}`);
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("accepts a `cascade` span (the kind the old hand-mirrors dropped)", () => {
    const result = buildSpanTree(
      snapshot({ atMs: 2000, open: [], completed: [span({ kind: "cascade" })] }),
    );
    expect(ok(result).roots[0]!.kind).toBe("cascade");
  });
});

describe("buildSpanTree — linking", () => {
  it("links a child under its parent instance and keeps roots separate", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [span({ id: 1, parentId: null, kind: "http", label: "GET /a", t1: null })],
          completed: [span({ id: 2, parentId: 1, kind: "db", label: "q", t0: 1300, t1: 1500 })],
        }),
      ),
    );
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.id).toBe(1);
    expect(result.roots[0]!.children.map((c) => c.id)).toEqual([2]);
    expect(result.roots[0]!.children[0]!.orphan).toBe(false);
  });

  it("puts concurrent same-label spans under their own distinct parents", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({ id: 1, parentId: null, kind: "flush", label: "flush", t0: 1100, t1: 1900 }),
            span({ id: 2, parentId: null, kind: "flush", label: "flush", t0: 1150, t1: 1900 }),
            // Two runs of the SAME loader label, one per flush. Under the old
            // {kind,label} parent chain these were indistinguishable.
            span({ id: 3, parentId: 1, kind: "loader", label: "tasks", t0: 1200, t1: 1400 }),
            span({ id: 4, parentId: 2, kind: "loader", label: "tasks", t0: 1250, t1: 1450 }),
          ],
        }),
      ),
    );
    expect(result.roots.map((r) => r.id)).toEqual([1, 2]);
    expect(result.roots[0]!.children.map((c) => c.id)).toEqual([3]);
    expect(result.roots[1]!.children.map((c) => c.id)).toEqual([4]);
  });

  it("promotes a span whose parent is not in the window to a flagged root", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [span({ id: 7, parentId: 3 })], // 3 was evicted / never entered the ring
        }),
      ),
    );
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.orphan).toBe(true);
    expect(ancestorChain(result.roots[0]!, result.byId)).toEqual([]);
  });

  it("refuses to link a back-edge (parentId >= id), so a cycle is unrepresentable", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({ id: 1, parentId: 2, t0: 1100 }),
            span({ id: 2, parentId: 1, t0: 1200 }),
          ],
        }),
      ),
    );
    // 1→2 is a back-edge (refused, orphan root); 2→1 is legal.
    expect(result.roots.map((r) => r.id)).toEqual([1]);
    expect(result.roots[0]!.orphan).toBe(true);
    expect(result.roots[0]!.children.map((c) => c.id)).toEqual([2]);
    expect(result.byId.get(2)!.orphan).toBe(false);
  });

  it("self-parenting (parentId === id) is refused", () => {
    const result = ok(
      buildSpanTree(snapshot({ atMs: 2000, open: [], completed: [span({ id: 5, parentId: 5 })] })),
    );
    expect(result.roots[0]!.orphan).toBe(true);
    expect(result.roots[0]!.children).toEqual([]);
  });

  it("orders roots and children by t0 then id", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({ id: 10, parentId: null, t0: 1300 }),
            span({ id: 11, parentId: null, t0: 1100 }),
            span({ id: 13, parentId: 11, t0: 1150 }), // same t0 as 12 → id breaks the tie
            span({ id: 12, parentId: 11, t0: 1150 }),
          ],
        }),
      ),
    );
    expect(result.roots.map((r) => r.id)).toEqual([11, 10]);
    expect(result.roots[0]!.children.map((c) => c.id)).toEqual([12, 13]);
  });
});

describe("buildSpanTree — positioning", () => {
  it("computes totalMs and window-relative bars", () => {
    const result = ok(buildSpanTree(snapshot({ atMs: 2000, open: [], completed: [span({})] })));
    expect(result.totalMs).toBe(1000);
    expect(result.roots[0]!.startMs).toBe(200); // t0 1200 − windowStart 1000
    expect(result.roots[0]!.durationMs).toBe(600);
  });

  it("clamps a span that began before the window to the left edge", () => {
    const result = ok(
      buildSpanTree(snapshot({ atMs: 2000, open: [], completed: [span({ t0: 500, t1: 1400 })] })),
    );
    const node = result.roots[0]!;
    expect(node.startMs).toBe(0);
    expect(node.durationMs).toBe(400);
    expect(node.t0).toBe(500); // raw preserved
  });

  it("extends an open span to the window edge and flags it open", () => {
    const result = ok(
      buildSpanTree(snapshot({ atMs: 2000, open: [span({ t0: 1600, t1: null })], completed: [] })),
    );
    const node = result.roots[0]!;
    expect(node.open).toBe(true);
    expect(node.startMs).toBe(600);
    expect(node.durationMs).toBe(400);
    // No waitBands in the payload → position genuinely unavailable, a distinct fact
    // from an empty positioned list (the span waited nothing).
    expect(node.waitPosition).toEqual({ kind: "unavailable" });
  });
});

describe("buildSpanTree — positioned wait bands", () => {
  // Bar: t0 1200 → startMs 200, durationMs 600. Band offsets are BAR-relative.
  it("positions wait bands at their true bar-relative offsets", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({
              t0: 1200,
              t1: 1800,
              waitMs: 250,
              waitBands: [
                { layer: "db-acquire", t0: 1300, t1: 1400 }, // 100ms @ bar-relative 100
                { layer: "db-acquire", t0: 1550, t1: 1700 }, // 150ms @ bar-relative 350
              ],
            }),
          ],
        }),
      ),
    );
    const wp = result.roots[0]!.waitPosition;
    if (wp.kind !== "positioned") throw new Error(`expected positioned, got ${wp.kind}`);
    expect(wp.bands).toEqual([
      { layer: "db-acquire", startMs: 100, ms: 100 },
      { layer: "db-acquire", startMs: 350, ms: 150 },
    ]);
    expect(wp.positionedMs).toBe(250);
    expect(wp.residualMs).toBe(0); // bands cover the whole waitMs
  });

  it("unions overlapping layers for positionedMs — strictly less than the per-layer sum", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({
              t0: 1200,
              t1: 1800,
              // waitMs is the recorder's CROSS-LAYER union — [1300,1600] = 300.
              waitMs: 300,
              waitBands: [
                { layer: "db-acquire", t0: 1300, t1: 1500 }, // 200ms
                { layer: "read-admit", t0: 1400, t1: 1600 }, // 200ms, overlaps 100ms
              ],
            }),
          ],
        }),
      ),
    );
    const wp = result.roots[0]!.waitPosition;
    if (wp.kind !== "positioned") throw new Error(`expected positioned, got ${wp.kind}`);
    expect(wp.positionedMs).toBe(300); // union of [100,300]∪[200,400] (bar-relative)
    expect(wp.positionedMs).toBeLessThan(200 + 200); // < the per-layer sum
    expect(wp.residualMs).toBe(0);
  });

  it("reports residualMs when bands were dropped to the recorder's per-layer cap", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            // waitMs 500, but only 300ms of bands survived the recorder's cap.
            span({
              t0: 1200,
              t1: 1800,
              waitMs: 500,
              waitBands: [{ layer: "db-acquire", t0: 1300, t1: 1600 }], // 300ms
            }),
          ],
        }),
      ),
    );
    const wp = result.roots[0]!.waitPosition;
    if (wp.kind !== "positioned") throw new Error(`expected positioned, got ${wp.kind}`);
    expect(wp.positionedMs).toBe(300);
    expect(wp.residualMs).toBe(200); // the dropped-band shortfall, reported never painted
  });

  it("marks a span with no waitBands as unavailable — not an empty positioned list", () => {
    const result = ok(
      buildSpanTree(snapshot({ atMs: 2000, open: [], completed: [span({ waitMs: 120 })] })),
    );
    // The distinction the whole discriminated union exists for: pre-band trace vs
    // "captured, waited nothing".
    expect(result.roots[0]!.waitPosition).toEqual({ kind: "unavailable" });
  });

  it("renders a span's own bands even when its children are absent from the window", () => {
    // Bands are per-span (read off this span's payload), NOT reconstructed from a
    // subtree — so a parent whose children were truncated out still shows its waits.
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({
              id: 1,
              parentId: null,
              kind: "flush",
              label: "flush",
              t0: 1100,
              t1: 1900,
              waitMs: 200,
              waitBands: [{ layer: "loader-acquire", t0: 1300, t1: 1500 }],
            }),
            // child id 2 (under 1) is deliberately absent — truncated from the window.
          ],
        }),
      ),
    );
    const node = result.roots[0]!;
    expect(node.children).toEqual([]);
    const wp = node.waitPosition;
    if (wp.kind !== "positioned") throw new Error(`expected positioned, got ${wp.kind}`);
    expect(wp.bands).toEqual([{ layer: "loader-acquire", startMs: 200, ms: 200 }]);
  });

  it("clamps a wait band that extends past the window edge instead of dropping it", () => {
    const result = ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({
              t0: 1200,
              t1: 1800,
              waitMs: 300,
              waitBands: [{ layer: "db-acquire", t0: 1700, t1: 2200 }], // t1 past the 2000 edge
            }),
          ],
        }),
      ),
    );
    const wp = result.roots[0]!.waitPosition;
    if (wp.kind !== "positioned") throw new Error(`expected positioned, got ${wp.kind}`);
    // 1700 → bar-relative 500; end clamped to the window edge (totalMs 1000) → 300ms wide.
    expect(wp.bands).toEqual([{ layer: "db-acquire", startMs: 500, ms: 300 }]);
  });
});

describe("crossLayerUnionMs", () => {
  it("sums disjoint intervals", () => {
    expect(
      crossLayerUnionMs([
        { startMs: 0, ms: 10 },
        { startMs: 20, ms: 5 },
      ]),
    ).toBe(15);
  });

  it("merges overlapping intervals into their union, not their sum", () => {
    // db-acquire [10,50] ∪ read-admit [30,60] = [10,60] = 50 (the plan's example).
    expect(
      crossLayerUnionMs([
        { startMs: 10, ms: 40 },
        { startMs: 30, ms: 30 },
      ]),
    ).toBe(50);
  });

  it("treats touching intervals as one run and swallows a contained interval", () => {
    expect(
      crossLayerUnionMs([
        { startMs: 0, ms: 10 },
        { startMs: 10, ms: 10 },
      ]),
    ).toBe(20);
    expect(
      crossLayerUnionMs([
        { startMs: 0, ms: 100 },
        { startMs: 20, ms: 10 },
      ]),
    ).toBe(100);
  });

  it("is order-independent and zero for the empty set", () => {
    expect(crossLayerUnionMs([])).toBe(0);
    expect(
      crossLayerUnionMs([
        { startMs: 30, ms: 30 },
        { startMs: 10, ms: 40 },
      ]),
    ).toBe(50);
  });
});

describe("flattenTree / ancestorChain", () => {
  const tree = () =>
    ok(
      buildSpanTree(
        snapshot({
          atMs: 2000,
          open: [],
          completed: [
            span({ id: 1, parentId: null, kind: "http", label: "GET /a", t0: 1000 }),
            span({ id: 2, parentId: 1, kind: "loader", label: "tasks", t0: 1100 }),
            span({ id: 3, parentId: 2, kind: "db", label: "select", t0: 1200 }),
            span({ id: 4, parentId: 1, kind: "loader", label: "attempts", t0: 1300 }),
          ],
        }),
      ),
    );

  it("flattens depth-first with depths", () => {
    expect(flattenTree(tree().roots, new Set()).map((r) => [r.node.id, r.depth])).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 1],
    ]);
  });

  it("skips the subtree of a collapsed node but keeps the node itself", () => {
    expect(flattenTree(tree().roots, new Set([2])).map((r) => r.node.id)).toEqual([1, 2, 4]);
  });

  it("collapsing a root hides everything below it", () => {
    expect(flattenTree(tree().roots, new Set([1])).map((r) => r.node.id)).toEqual([1]);
  });

  it("resolves the ancestor chain innermost → outermost", () => {
    const t = tree();
    expect(ancestorChain(t.byId.get(3)!, t.byId).map((n) => n.id)).toEqual([2, 1]);
    expect(ancestorChain(t.byId.get(1)!, t.byId)).toEqual([]);
  });
});
