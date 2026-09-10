import { describe, expect, test } from "bun:test";
import { fitPair } from "./fit-pair";

const unit = { width: 1320, height: 868 };

describe("fitPair", () => {
  test("a wide pane holds two wide screens side by side", () => {
    const fit = fitPair({
      room: { width: 1650, height: 850 },
      unit,
      band: 20,
      gap: 8,
    });
    expect(fit.direction).toBe("row");
    // Width-bound: (1650 - 8) / 2640.
    expect(fit.scale).toBe(0.621);
  });

  test("a narrow pane stacks them when that paints them bigger", () => {
    const fit = fitPair({
      room: { width: 900, height: 1000 },
      unit,
      band: 20,
      gap: 8,
    });
    expect(fit.direction).toBe("col");
    // Height-bound: (1000 - 40 - 8) / 1736, beating side by side's 892 / 2640.
    expect(fit.scale).toBe(0.548);
  });

  test("a short pane fits the height too, not just the width", () => {
    const fit = fitPair({
      room: { width: 2400, height: 500 },
      unit,
      band: 20,
      gap: 8,
    });
    expect(fit.direction).toBe("row");
    expect(fit.scale).toBe(0.552);
  });

  test("never zooms in, and prefers side by side when both fit at 100%", () => {
    const fit = fitPair({
      room: { width: 4000, height: 4000 },
      unit,
      band: 20,
      gap: 8,
    });
    expect(fit).toEqual({ direction: "row", scale: 1 });
  });

  test("the fitted pair never exceeds the room", () => {
    for (const room of [
      { width: 1661, height: 591 },
      { width: 1003, height: 777 },
      { width: 733, height: 1201 },
    ]) {
      const band = 21;
      const gap = 8;
      const { direction, scale } = fitPair({ room, unit, band, gap });
      const w =
        direction === "row" ? 2 * unit.width * scale + gap : unit.width * scale;
      const h =
        direction === "row"
          ? unit.height * scale + band
          : 2 * (unit.height * scale + band) + gap;
      expect(w).toBeLessThanOrEqual(room.width);
      expect(h).toBeLessThanOrEqual(room.height);
    }
  });

  test("a room not laid out yet gets the floor, not a negative scale", () => {
    const fit = fitPair({
      room: { width: 0, height: 0 },
      unit,
      band: 20,
      gap: 8,
    });
    expect(fit.scale).toBe(0.05);
  });
});
