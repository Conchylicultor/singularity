import { describe, expect, it } from "bun:test";
import { areaPath, linePaths, type PlotPoint } from "./line-path";

const pt = (x: number, y: number): PlotPoint => ({ x, y });
const none = () => false;

describe("linePaths", () => {
  it("draws one continuous path through present points", () => {
    const r = linePaths([pt(0, 5), pt(1, 6), pt(2, 7)], none);
    expect(r.solid).toBe("M0,5L1,6L2,7");
    expect(r.dashed).toBe("");
    expect(r.isolated).toEqual([]);
    expect(r.runs).toEqual([[0, 1, 2]]);
  });

  it("breaks the line at a null instead of dropping to zero", () => {
    const r = linePaths([pt(0, 5), pt(1, 6), null, pt(3, 7), pt(4, 8)], none);
    expect(r.solid).toBe("M0,5L1,6M3,7L4,8");
    expect(r.runs).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it("marks a lone point between gaps as isolated", () => {
    const r = linePaths([null, pt(1, 6), null, pt(3, 7)], none);
    expect(r.solid).toBe("");
    expect(r.isolated).toEqual([1, 3]);
  });

  it("dashes the segment into a partial bucket", () => {
    const r = linePaths([pt(0, 5), pt(1, 6), pt(2, 7)], (i) => i === 2);
    expect(r.solid).toBe("M0,5L1,6");
    expect(r.dashed).toBe("M1,6L2,7");
  });

  it("handles n = 0 and n = 1", () => {
    expect(linePaths([], none)).toEqual({
      solid: "",
      dashed: "",
      isolated: [],
      runs: [],
    });
    expect(linePaths([pt(3, 4)], none).isolated).toEqual([0]);
  });
});

describe("areaPath", () => {
  it("closes a run down to the baseline", () => {
    const pts = [pt(0, 5), pt(1, 6), pt(2, 7)];
    expect(areaPath(pts, [0, 1, 2], 10)).toBe("M0,5L1,6L2,7L2,10L0,10Z");
  });

  it("draws nothing for a single-point run", () => {
    expect(areaPath([pt(0, 5)], [0], 10)).toBe("");
  });
});
