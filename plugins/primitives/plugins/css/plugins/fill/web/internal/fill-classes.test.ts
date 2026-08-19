import { describe, expect, test } from "bun:test";
import { growClass } from "@plugins/primitives/plugins/css/plugins/grow/web";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";
import { fillClasses } from "./fill";

describe("fillClasses", () => {
  test("x axis pairs flex-1 with the horizontal min override", () => {
    expect(fillClasses("x")).toBe("min-w-0 flex-1");
  });

  test("y axis pairs flex-1 with the vertical min override", () => {
    expect(fillClasses("y")).toBe("min-h-0 flex-1");
  });

  test("a fill IS its two halves — grow + yield, nothing more", () => {
    // The algebra of the four space-sharing roles, as a test rather than as
    // prose: `Fill` is not a fifth thing, it is the cell that takes slack AND
    // gives below its content. Deriving it is what stops the pair drifting from
    // `growClass()`/`yieldClass()` — and this pins the ORDER too, which is what
    // keeps the emitted string byte-identical to the hand-written original.
    for (const axis of ["x", "y"] as const) {
      expect(fillClasses(axis)).toBe(`${yieldClass(axis)} ${growClass()}`);
    }
  });
});
