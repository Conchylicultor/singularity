import { describe, expect, test } from "bun:test";
import { semanticsAttrs, type BlockSemantics } from "./block-semantics";

/** Every level `role="heading"` admits, so no value of the arm goes untested. */
const LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** Every arm of the union, as values — one per heading level today. */
const ARMS: BlockSemantics[] = LEVELS.map((level) => ({
  role: "heading",
  level,
}));

describe("semanticsAttrs", () => {
  test("a type that declares nothing contributes NO attributes", () => {
    // The plain-paragraph case, and the reason the shared skeleton spreads this
    // unconditionally: an empty record leaves the leaf cell a bare `div`, so a
    // block type that says nothing about its ARIA identity adds nothing to the
    // DOM.
    expect(semanticsAttrs(undefined)).toEqual({});
  });

  test("each heading level becomes role=heading plus its own aria-level", () => {
    // Both attributes, always together: `role="heading"` with no `aria-level` is
    // level 2 by default, so a mapping that could emit the role alone would
    // silently announce every H1 and H3 as an H2.
    for (const level of LEVELS) {
      expect(semanticsAttrs({ role: "heading", level })).toEqual({
        role: "heading",
        "aria-level": level,
      });
    }
  });

  test("every arm of the union maps to something", () => {
    // A future arm added without a `case` falls off the end of the switch and
    // returns `undefined`, which spreads as a crash rather than as attributes.
    // tsc catches that; this catches it too, for the same cost.
    for (const arm of ARMS) {
      expect(semanticsAttrs(arm)).toBeDefined();
    }
  });
});
