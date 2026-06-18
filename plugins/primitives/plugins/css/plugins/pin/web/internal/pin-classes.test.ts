import { describe, expect, test } from "bun:test";
import { pinClasses } from "./pin";

const base = { outset: false, layer: "raised" as const, decorative: false, stretch: false };

describe("pinClasses", () => {
  test("a corner pins both adjacent edges via inline style", () => {
    expect(pinClasses({ ...base, to: "top-right", offset: "xs" })).toEqual({
      className: "absolute z-raised",
      style: { top: "var(--space-xs)", right: "var(--space-xs)" },
    });
  });

  test("outset negates the offset (overhang the corner)", () => {
    expect(pinClasses({ ...base, to: "top-right", offset: "xs", outset: true })).toEqual({
      className: "absolute z-raised",
      style: { top: "calc(var(--space-xs) * -1)", right: "calc(var(--space-xs) * -1)" },
    });
  });

  test("none offset is a literal 0", () => {
    expect(pinClasses({ ...base, to: "bottom-left", offset: "none" })).toEqual({
      className: "absolute z-raised",
      style: { bottom: "0", left: "0" },
    });
  });

  test("an edge-center pins the edge and centers the perpendicular axis", () => {
    expect(pinClasses({ ...base, to: "left", offset: "sm" })).toEqual({
      className: "absolute z-raised top-1/2 -translate-y-1/2",
      style: { left: "var(--space-sm)" },
    });
    expect(pinClasses({ ...base, to: "bottom", offset: "xs" })).toEqual({
      className: "absolute z-raised left-1/2 -translate-x-1/2",
      style: { bottom: "var(--space-xs)" },
    });
  });

  test("stretch spans the perpendicular axis instead of centering", () => {
    expect(pinClasses({ ...base, to: "right", offset: "sm", stretch: true })).toEqual({
      className: "absolute z-raised inset-y-0",
      style: { right: "var(--space-sm)" },
    });
    expect(pinClasses({ ...base, to: "top", offset: "none", stretch: true })).toEqual({
      className: "absolute z-raised inset-x-0",
      style: { top: "0" },
    });
  });

  test("center is the four-class translate trick and ignores offset", () => {
    expect(pinClasses({ ...base, to: "center", offset: "lg" })).toEqual({
      className: "absolute z-raised top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
      style: {},
    });
  });

  test("decorative adds pointer-events-none; layer maps to a z-class", () => {
    expect(
      pinClasses({ ...base, to: "top-left", offset: "none", decorative: true, layer: "overlay" }),
    ).toEqual({
      className: "absolute z-overlay pointer-events-none",
      style: { top: "0", left: "0" },
    });
  });
});
