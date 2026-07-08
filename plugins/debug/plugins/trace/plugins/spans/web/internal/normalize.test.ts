import { describe, it, expect } from "bun:test";
import type { TraceSnapshot } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { normalizeTrace } from "./normalize";

// Build a minimal v2 snapshot with a spans flight window. windowStartMs=1000,
// atMs=2000 → a 1000ms window.
function snapshot(spans: unknown): TraceSnapshot {
  return {
    v: 2,
    id: "t1",
    atMs: 2000,
    wallTime: "2026-07-08T00:00:00.000Z",
    worktree: "wt",
    windowStartMs: 1000,
    trigger: { kind: "loader", label: "x", durationMs: 900, thresholdMs: 500 },
    events: { spans },
  };
}

function span(over: Partial<Record<string, unknown>>) {
  return {
    kind: "loader",
    label: "load-x",
    t0: 1200,
    t1: 1800,
    ageMs: 600,
    parents: [],
    waitMs: 0,
    childMs: 0,
    selfMs: 600,
    ...over,
  };
}

describe("normalizeTrace", () => {
  it("returns empty lanes when the spans section is absent/invalid", () => {
    expect(normalizeTrace(snapshot(undefined)).lanes).toEqual([]);
    expect(normalizeTrace(snapshot({ bogus: true })).lanes).toEqual([]);
  });

  it("computes totalMs from the window and buckets bars per (kind,label)", () => {
    const norm = normalizeTrace(
      snapshot({
        atMs: 2000,
        open: [],
        completed: [span({}), span({ t0: 1300, t1: 1900 })],
      }),
    );
    expect(norm.totalMs).toBe(1000);
    expect(norm.lanes).toHaveLength(1);
    expect(norm.lanes[0]!.key).toBe("loader:load-x");
    expect(norm.lanes[0]!.bars).toHaveLength(2);
    // window-relative: t0 1200 - windowStart 1000 = 200
    expect(norm.lanes[0]!.bars[0]!.startMs).toBe(200);
    expect(norm.lanes[0]!.bars[0]!.durationMs).toBe(600);
  });

  it("clamps a span that began before the window to the left edge", () => {
    const norm = normalizeTrace(
      snapshot({ atMs: 2000, open: [], completed: [span({ t0: 500, t1: 1400 })] }),
    );
    const bar = norm.lanes[0]!.bars[0]!;
    expect(bar.startMs).toBe(0); // 500 < windowStart 1000
    expect(bar.durationMs).toBe(400); // clamped end 1400-1000=400
    expect(bar.t0).toBe(500); // raw preserved
  });

  it("extends an open span to the window edge and flags it open", () => {
    const norm = normalizeTrace(
      snapshot({ atMs: 2000, open: [span({ t1: null, t0: 1600 })], completed: [] }),
    );
    const bar = norm.lanes[0]!.bars[0]!;
    expect(bar.open).toBe(true);
    expect(bar.startMs).toBe(600);
    expect(bar.durationMs).toBe(400); // extends to atMs 2000 → 1000-600
    expect(bar.segments).toBeUndefined(); // open spans carry no wait segment
  });

  it("splits a completed span with waitMs into a leading wait + work segment", () => {
    const norm = normalizeTrace(
      snapshot({
        atMs: 2000,
        open: [],
        completed: [span({ t0: 1200, t1: 1800, waitMs: 200 })],
      }),
    );
    const bar = norm.lanes[0]!.bars[0]!;
    expect(bar.segments).toEqual([
      { kind: "wait", ms: 200 },
      { kind: "work", ms: 400 },
    ]);
  });

  it("orders lanes by span-kind then label", () => {
    const norm = normalizeTrace(
      snapshot({
        atMs: 2000,
        open: [],
        completed: [
          span({ kind: "db", label: "q" }),
          span({ kind: "http", label: "GET /a" }),
        ],
      }),
    );
    expect(norm.lanes.map((l) => l.kind)).toEqual(["http", "db"]);
  });
});
