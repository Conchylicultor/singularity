import { describe, expect, it } from "bun:test";
import { foldLoopTime } from "./loop-fold";

describe("foldLoopTime", () => {
  it("is the identity at iteration 0 with no window", () => {
    expect(foldLoopTime(0, null)).toEqual({ sec: 0, iter: 0 });
    expect(foldLoopTime(123.4, null)).toEqual({ sec: 123.4, iter: 0 });
  });

  it("is the identity before the first wrap (rawSec < endSec)", () => {
    const win = { startSec: 2, endSec: 6 };
    // A start before A still plays straight through into the loop.
    expect(foldLoopTime(0, win)).toEqual({ sec: 0, iter: 0 });
    expect(foldLoopTime(2, win)).toEqual({ sec: 2, iter: 0 });
    expect(foldLoopTime(5.999, win)).toEqual({ sec: 5.999, iter: 0 });
  });

  it("wraps into [startSec, endSec) with an increasing iteration count", () => {
    const win = { startSec: 2, endSec: 6 }; // length 4
    // First wrap: at endSec exactly we are at the start of iteration 1.
    expect(foldLoopTime(6, win)).toEqual({ sec: 2, iter: 1 });
    let f = foldLoopTime(7.5, win);
    expect(f.iter).toBe(1);
    expect(f.sec).toBeCloseTo(3.5, 10);
    // Just before the second wrap.
    f = foldLoopTime(9.999, win);
    expect(f.iter).toBe(1);
    expect(f.sec).toBeCloseTo(5.999, 10);
    // Second wrap.
    expect(foldLoopTime(10, win)).toEqual({ sec: 2, iter: 2 });
    f = foldLoopTime(11, win);
    expect(f.iter).toBe(2);
    expect(f.sec).toBeCloseTo(3, 10);
  });

  it("keeps the folded position strictly inside the window across many iterations", () => {
    const win = { startSec: 1, endSec: 4 }; // length 3
    for (let i = 0; i < 200; i++) {
      const raw = 4 + i * 0.37; // sweep well past the first wrap
      const { sec, iter } = foldLoopTime(raw, win);
      expect(sec).toBeGreaterThanOrEqual(win.startSec);
      expect(sec).toBeLessThan(win.endSec);
      expect(iter).toBeGreaterThanOrEqual(1);
    }
  });

  it("treats a degenerate (zero/negative length) window as the identity", () => {
    expect(foldLoopTime(9, { startSec: 5, endSec: 5 })).toEqual({
      sec: 9,
      iter: 0,
    });
    expect(foldLoopTime(9, { startSec: 6, endSec: 5 })).toEqual({
      sec: 9,
      iter: 0,
    });
  });
});
