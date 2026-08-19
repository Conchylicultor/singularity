import { describe, expect, test } from "bun:test";
import { yieldClass } from "./yield";

describe("yieldClass", () => {
  test("x axis emits exactly the horizontal min override", () => {
    expect(yieldClass("x")).toBe("min-w-0");
  });

  test("y axis emits exactly the vertical min override", () => {
    expect(yieldClass("y")).toBe("min-h-0");
  });

  test("it emits NOTHING else — yielding is not a grow decision", () => {
    // This is the entire reason the primitive exists. `Fill` bundles `flex-1`
    // with the same `min-*-0`, and that basis-0 grow is what makes it WRONG for
    // a cell that must yield beside a sibling: the sibling (basis auto) takes
    // its full content width and the fill'd cell is squeezed alone, instead of
    // the two yielding together. Adding `flex-1` here would delete the role.
    expect(yieldClass("x").split(" ")).toEqual(["min-w-0"]);
    expect(yieldClass("y").split(" ")).toEqual(["min-h-0"]);
  });

  test("it takes an axis — min-width:0 and min-height:0 are two properties", () => {
    // Locks the deliberate asymmetry with `rigidClass()`/`growClass()`, which
    // take none: `flex-shrink`/`flex-grow` are single properties that already
    // follow the container's main axis.
    expect(yieldClass.length).toBe(1);
  });
});
