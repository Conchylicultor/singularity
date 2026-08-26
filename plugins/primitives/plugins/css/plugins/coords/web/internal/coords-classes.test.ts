import { zLayerClass } from "@plugins/primitives/plugins/css/plugins/z-layers/web";
import { describe, expect, test } from "bun:test";
import { type Extent, pct, placedClasses, placedStyle } from "./coords";

describe("placedClasses", () => {
  test("a bare placed box is exactly `absolute` — no stacking level", () => {
    // Deliberately unlike `pinClasses`, which defaults to `raised`. Every bar /
    // marker / overlay this replaces paints by DOM order, and even `z-index: 0`
    // would open a stacking context none of them asked for.
    expect(placedClasses()).toBe("absolute");
  });

  test("an empty options object resolves identically to no argument", () => {
    // The defaults live in ONE place (this function), so the two call forms
    // cannot diverge.
    expect(placedClasses({})).toBe(placedClasses());
  });

  test("decorative adds pointer-events-none", () => {
    expect(placedClasses({ decorative: true })).toBe(
      "absolute pointer-events-none",
    );
  });

  test("decorative: false is the default, not an extra token", () => {
    expect(placedClasses({ decorative: false })).toBe(placedClasses());
  });

  test("layer resolves THROUGH the z-layer scale, never a literal z class", () => {
    // Asserted as an equality with `zLayerClass`, not against the string
    // "z-overlay": the scale owns the spelling, and a rename there must not need
    // an edit here to stay true.
    expect(placedClasses({ layer: "overlay" })).toBe(
      `absolute ${zLayerClass("overlay")}`,
    );
    expect(placedClasses({ layer: "nav", decorative: true })).toBe(
      `absolute ${zLayerClass("nav")} pointer-events-none`,
    );
  });
});

describe("placedStyle — axes", () => {
  test("fill spans the axis end to end on the axis's own two properties", () => {
    expect(placedStyle("fill", "fill")).toEqual({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    });
  });

  test("a start anchor with a size writes the near edge and the extent", () => {
    expect(placedStyle({ start: "25%", size: "10%" }, "fill")).toEqual({
      left: "25%",
      width: "10%",
      top: 0,
      bottom: 0,
    });
  });

  test("bare numbers are px; strings pass through verbatim", () => {
    expect(
      placedStyle({ start: 12, size: 40 }, { start: 0, size: "2rem" }),
    ).toEqual({
      left: "12px",
      width: "40px",
      top: "0px",
      height: "2rem",
    });
  });

  test("an end anchor writes the FAR edge, per axis", () => {
    expect(placedStyle({ end: 8 }, { end: "1rem", size: 3 })).toEqual({
      right: "8px",
      bottom: "1rem",
      height: "3px",
    });
  });

  test("start+end pins both edges and declares no size", () => {
    expect(placedStyle({ start: "10%", end: "20%" }, "fill")).toEqual({
      left: "10%",
      right: "20%",
      top: 0,
      bottom: 0,
    });
  });

  test("minSize is the axis's min-* property, so CSS resolves max(size, minSize)", () => {
    // The Gantt's sub-pixel bar: the TRUE width stays declared and the floor is
    // a separate property, rather than the old `Math.max` that overwrote it.
    expect(
      placedStyle({ start: "0%", size: "0.05%", minSize: "0.3%" }, "fill"),
    ).toEqual({
      left: "0%",
      width: "0.05%",
      minWidth: "0.3%",
      top: 0,
      bottom: 0,
    });
  });

  test("the two axes never share a property", () => {
    const style = placedStyle({ start: 1, size: 2 }, { start: 3, size: 4 });
    expect(style).toEqual({
      left: "1px",
      width: "2px",
      top: "3px",
      height: "4px",
    });
  });
});

describe("placedStyle — shift and center", () => {
  test("no shift on either axis ⇒ no `translate` key AT ALL", () => {
    for (const [x, y] of [
      ["fill", "fill"],
      [{ start: 0 }, { end: 0 }],
      [
        { start: "1%", end: "2%" },
        { start: 4, size: 8, minSize: 2 },
      ],
    ] satisfies [Extent, Extent][]) {
      expect(Object.keys(placedStyle(x, y))).not.toContain("translate");
    }
  });

  test("a shift on ONE axis leaves the other at 0", () => {
    // The windowed-row shape: x is inset, only y is composited. A whole-component
    // motion mode cannot express this, which is why `shift` is per axis.
    expect(placedStyle({ start: 0, end: 0 }, { start: 0, shift: 240 })).toEqual(
      {
        left: "0px",
        right: "0px",
        top: "0px",
        translate: "0 240px",
      },
    );
    expect(placedStyle({ start: "50%", shift: "-2px" }, "fill")).toEqual({
      left: "50%",
      top: 0,
      bottom: 0,
      translate: "-2px 0",
    });
  });

  test("center is exactly sugar for a start anchor plus shift: -50%", () => {
    expect(placedStyle({ center: "40%" }, "fill")).toEqual(
      placedStyle({ start: "40%", shift: "-50%" }, "fill"),
    );
    expect(placedStyle({ center: "40%" }, { center: 10 })).toEqual({
      left: "40%",
      top: "10px",
      translate: "-50% -50%",
    });
  });

  test("a shift composes with an inset base, on the same axis", () => {
    // Sonata's loop region: an inset base AND a shift on top.
    expect(
      placedStyle({ start: "10%", end: "10%", shift: "-1px" }, "fill"),
    ).toEqual({
      left: "10%",
      right: "10%",
      top: 0,
      bottom: 0,
      translate: "-1px 0",
    });
  });

  test("`transform` is NEVER emitted, on any input", () => {
    // Load-bearing: per-frame writers own `el.style.transform`, and CSS applies
    // `translate` first, so the two compose. Emitting `transform` here would
    // silently clobber them at every such site.
    const inputs: [Extent, Extent][] = [
      ["fill", "fill"],
      [{ start: 0 }, { start: 0 }],
      [{ center: "50%" }, { center: "50%" }],
      [
        { start: "1%", shift: "-50%" },
        { end: 2, shift: 3 },
      ],
      [{ start: "1%", end: "2%", shift: "-1px" }, "fill"],
      [
        { end: 0, size: 4, minSize: 1 },
        { center: 0, size: 4 },
      ],
    ];
    for (const [x, y] of inputs) {
      expect(Object.keys(placedStyle(x, y))).not.toContain("transform");
    }
  });
});

describe("placedStyle — over-specified extents are a type error", () => {
  test("the conflict arms do not compile", () => {
    // These are the mistakes CSS resolves SILENTLY (one property simply loses),
    // which is why they are `?: never` on every arm rather than a runtime throw.
    // @ts-expect-error start+end may not also declare a size
    placedStyle({ start: 0, end: 0, size: 10 }, "fill");
    // @ts-expect-error center is exclusive with an edge anchor
    placedStyle({ center: "50%", start: 0 }, "fill");
    // @ts-expect-error center is exclusive with an edge anchor
    placedStyle({ center: "50%", end: 0 }, "fill");
    // @ts-expect-error center already IS a shift; a second one has no meaning
    placedStyle({ center: "50%", shift: "-50%" }, "fill");
    // @ts-expect-error start+end pins both edges, so a minSize has nothing to floor
    placedStyle({ start: 0, end: 0, minSize: 4 }, "fill");
    // @ts-expect-error an extent must anchor SOMETHING
    placedStyle({ size: 10 }, "fill");
    expect(true).toBe(true);
  });
});

describe("pct", () => {
  test("a fraction becomes the percentage string 14 sites hand-rolled", () => {
    expect(pct(0.25)).toBe("25%");
    expect(pct(0)).toBe("0%");
    expect(pct(1)).toBe("100%");
  });

  test("it is UNCLAMPED — culling an off-track tick is the caller's decision", () => {
    expect(pct(-0.1)).toBe("-10%");
    expect(pct(1.5)).toBe("150%");
  });

  test("it is UNROUNDED — a zoomed Gantt is made of sub-percent precision", () => {
    expect(pct(0.123456789)).toBe("12.3456789%");
  });
});
