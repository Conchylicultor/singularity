import { describe, it, expect } from "bun:test";
import type { TraceSnapshot } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { buildSpanTree, flattenTree, ancestorChain, type SpanTreeResult } from "./build-tree";

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
    expect(node.segments).toBeUndefined(); // open spans carry no wait segment
  });

  it("splits a completed span with waitMs into a leading wait + trailing work segment", () => {
    const result = ok(
      buildSpanTree(
        snapshot({ atMs: 2000, open: [], completed: [span({ t0: 1200, t1: 1800, waitMs: 200 })] }),
      ),
    );
    expect(result.roots[0]!.segments).toEqual([
      { kind: "wait", ms: 200 },
      { kind: "work", ms: 400 },
    ]);
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
