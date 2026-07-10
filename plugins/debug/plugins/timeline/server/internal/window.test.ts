import { describe, expect, test } from "bun:test";
import { overlapsWindow } from "./window";

describe("overlapsWindow", () => {
  test("interval fully inside the window overlaps", () => {
    expect(overlapsWindow(150, 250, 100, 300)).toBe(true);
  });

  test("interval straddling the left edge overlaps", () => {
    expect(overlapsWindow(50, 150, 100, 300)).toBe(true);
  });

  test("interval straddling the right edge overlaps", () => {
    expect(overlapsWindow(250, 350, 100, 300)).toBe(true);
  });

  test("interval containing the whole window overlaps", () => {
    expect(overlapsWindow(50, 350, 100, 300)).toBe(true);
  });

  test("interval entirely before the window does not overlap", () => {
    expect(overlapsWindow(10, 90, 100, 300)).toBe(false);
  });

  test("interval entirely after the window does not overlap", () => {
    expect(overlapsWindow(310, 400, 100, 300)).toBe(false);
  });

  test("touching edges count as overlap (closed intervals)", () => {
    expect(overlapsWindow(10, 100, 100, 300)).toBe(true);
    expect(overlapsWindow(300, 400, 100, 300)).toBe(true);
  });

  test("point event (start === end) at a window edge is included", () => {
    expect(overlapsWindow(100, 100, 100, 300)).toBe(true);
    expect(overlapsWindow(300, 300, 100, 300)).toBe(true);
    expect(overlapsWindow(99, 99, 100, 300)).toBe(false);
  });
});
