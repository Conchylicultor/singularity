import { describe, expect, test } from "bun:test";
import { growClass } from "./grow";

describe("growClass", () => {
  test("a growing cell is exactly the slack-claiming flex-child class", () => {
    expect(growClass()).toBe("flex-1");
  });

  test("it emits NO min-*-0 — the content floor is the point", () => {
    // `Fill` pairs this with an axis-matched `min-*-0` so its leaf can
    // ellipsize. A grow-only cell WANTS the `min-width: auto` floor: the view
    // chips hug their content and only the trailing empty space grows. Adding a
    // `min-w-0` here would make this `fillClasses()` and delete the role.
    expect(growClass().split(" ")).toEqual(["flex-1"]);
  });

  test("it takes no axis — flex-grow already follows the container's main axis", () => {
    // Locks the deliberate asymmetry with `yieldClass(axis)`. `min-width:0` and
    // `min-height:0` are two properties; `flex-grow` is one. Same reasoning as
    // `rigidClass()`.
    expect(growClass.length).toBe(0);
  });
});
