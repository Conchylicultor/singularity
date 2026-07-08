import { describe, it, expect } from "bun:test";
import { groupIncidents, overlaps } from "./incidents";

const BASE = Date.parse("2026-07-08T00:00:00.000Z");

// Build a list item whose wall-clock interval is [startMs, endMs] (offsets from
// BASE): end = wallTime, span = end − start.
function item(id: string, startMs: number, endMs: number) {
  return {
    id,
    wallTime: new Date(BASE + endMs).toISOString(),
    windowSpanMs: endMs - startMs,
  };
}

describe("overlaps", () => {
  it("detects overlap and disjointness (touching edges count)", () => {
    expect(overlaps({ startMs: 0, endMs: 100 }, { startMs: 50, endMs: 150 })).toBe(true);
    expect(overlaps({ startMs: 0, endMs: 100 }, { startMs: 200, endMs: 300 })).toBe(false);
    expect(overlaps({ startMs: 0, endMs: 100 }, { startMs: 100, endMs: 200 })).toBe(true);
  });
});

describe("groupIncidents", () => {
  it("single trace → size 1", () => {
    const m = groupIncidents([item("a", 0, 100)]);
    expect(m.get("a")).toEqual({ incidentId: 0, size: 1, colorIndex: 0 });
  });

  it("two overlapping → shared incidentId, size 2", () => {
    const m = groupIncidents([item("a", 0, 100), item("b", 50, 150)]);
    expect(m.get("a")!.size).toBe(2);
    expect(m.get("b")!.size).toBe(2);
    expect(m.get("a")!.incidentId).toBe(m.get("b")!.incidentId);
  });

  it("disjoint → distinct incidents", () => {
    const m = groupIncidents([item("a", 0, 100), item("b", 200, 300)]);
    expect(m.get("a")!.incidentId).not.toBe(m.get("b")!.incidentId);
    expect(m.get("a")!.size).toBe(1);
    expect(m.get("b")!.size).toBe(1);
  });

  it("transitive chain (A∩B, B∩C, A∌C) → one incident of size 3", () => {
    // A [0,100], B [50,150], C [120,200]: A overlaps B, B overlaps C, A∌C.
    const m = groupIncidents([item("a", 0, 100), item("b", 50, 150), item("c", 120, 200)]);
    expect(overlaps({ startMs: 0, endMs: 100 }, { startMs: 120, endMs: 200 })).toBe(false);
    const id = m.get("a")!.incidentId;
    expect(m.get("b")!.incidentId).toBe(id);
    expect(m.get("c")!.incidentId).toBe(id);
    expect(m.get("a")!.size).toBe(3);
    expect(m.get("c")!.size).toBe(3);
  });

  it("boundary touch (aEnd === bStart) → grouped", () => {
    // A [0,100], B [100,200]: they touch exactly at 100.
    const m = groupIncidents([item("a", 0, 100), item("b", 100, 200)]);
    expect(m.get("a")!.incidentId).toBe(m.get("b")!.incidentId);
    expect(m.get("a")!.size).toBe(2);
  });

  it("stable across shuffled input order", () => {
    const a = item("a", 0, 100);
    const b = item("b", 50, 150);
    const c = item("c", 300, 400);
    const forward = groupIncidents([a, b, c]);
    const shuffled = groupIncidents([c, a, b]);
    for (const id of ["a", "b", "c"]) {
      expect(shuffled.get(id)).toEqual(forward.get(id)!);
    }
  });
});
