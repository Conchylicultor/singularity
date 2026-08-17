import { describe, expect, it } from "bun:test";
import { overflowPx, type Span } from "./overflow";

const BOX: Span = { left: 100, right: 700 };

describe("overflowPx", () => {
  it("is 0 for a row that fits", () => {
    expect(
      overflowPx(BOX, [
        { left: 120, right: 300 },
        { left: 320, right: 690 },
      ]),
    ).toBe(0);
  });

  it("is 0 when nothing is laid out", () => {
    // A row containing nothing cannot fail to contain it. Returning an overflow
    // here would accuse every bar whose occupants have all been relocated.
    expect(overflowPx(BOX, [])).toBe(0);
  });

  it("measures a right-edge overflow", () => {
    expect(overflowPx(BOX, [{ left: 120, right: 716 }])).toBe(15);
  });

  it("measures a LEFT-edge overflow", () => {
    // `align="end"` packs occupants against the far edge, so an over-full row
    // spills to the left. This is the case a right-edge-only test (and
    // `scrollWidth`) cannot see, and it is the production shape of every pane
    // header.
    expect(overflowPx(BOX, [{ left: 84, right: 690 }])).toBe(15);
  });

  it("takes the larger when both edges spill", () => {
    expect(overflowPx(BOX, [{ left: 90, right: 730 }])).toBe(29);
  });

  it("absorbs sub-pixel rounding within the tolerance", () => {
    expect(overflowPx(BOX, [{ left: 99.4, right: 700.6 }])).toBe(0);
  });

  it("takes the union across occupants, not just the last one", () => {
    expect(
      overflowPx(BOX, [
        { left: 80, right: 200 },
        { left: 210, right: 400 },
      ]),
    ).toBe(19);
  });
});
