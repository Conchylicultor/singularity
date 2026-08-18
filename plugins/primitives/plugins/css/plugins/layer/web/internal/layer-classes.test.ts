import { describe, expect, test } from "bun:test";
import { layerClasses } from "./layer";

describe("layerClasses", () => {
  test("a bare layer is exactly the full-bleed box at the base level", () => {
    expect(layerClasses()).toBe("absolute inset-0 z-base");
  });

  test("an empty options object resolves identically to no argument", () => {
    // The defaults live in ONE place (this function), so the two call forms
    // cannot diverge.
    expect(layerClasses({})).toBe(layerClasses());
  });

  test("decorative adds pointer-events-none", () => {
    expect(layerClasses({ decorative: true })).toBe(
      "absolute inset-0 z-base pointer-events-none",
    );
  });

  test("decorative: false is the default, not an extra token", () => {
    expect(layerClasses({ decorative: false })).toBe(layerClasses());
  });

  test("layer resolves through the z-layer scale, never a raw z number", () => {
    expect(layerClasses({ layer: "overlay" })).toBe(
      "absolute inset-0 z-overlay",
    );
    expect(layerClasses({ layer: "nav", decorative: true })).toBe(
      "absolute inset-0 z-nav pointer-events-none",
    );
  });

  test("the inset is always full-bleed — there is no partial-inset axis", () => {
    // Guards the deliberate omission: a layer that covers part of its parent is
    // a point anchor (`<Pin>`), not a `<Layer>` with an offset prop.
    for (const opts of [
      {},
      { decorative: true },
      { layer: "float" as const },
    ]) {
      expect(layerClasses(opts).split(" ")).toContain("inset-0");
    }
  });
});
