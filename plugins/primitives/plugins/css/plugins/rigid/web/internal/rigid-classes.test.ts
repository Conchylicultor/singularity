import { describe, expect, test } from "bun:test";
import { rigidClass } from "./rigid";

describe("rigidClass", () => {
  test("a rigid leaf is exactly the no-shrink flex-child class", () => {
    expect(rigidClass()).toBe("shrink-0");
  });

  test("it emits NOTHING else — rigidity is not a min-*-0 decision", () => {
    // `Fill` pairs `flex-1` with an axis-matched `min-*-0` because a growing
    // cell is floored at its content size. A rigid leaf WANTS that floor, so
    // adding a `min-w-0` here would defeat the primitive.
    expect(rigidClass().split(" ")).toEqual(["shrink-0"]);
  });

  test("it takes no axis — flex-shrink already follows the container's main axis", () => {
    // Locks the deliberate asymmetry with `fillClasses(axis)`. `min-width:0`
    // and `min-height:0` are two properties; `flex-shrink` is one.
    expect(rigidClass.length).toBe(0);
  });
});
