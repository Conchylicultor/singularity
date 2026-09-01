import { describe, expect, test } from "bun:test";
import { reconcile } from "./reconcile";
import { mapCaret } from "./map-caret";

describe("reconcile", () => {
  test("the external value being the last saved one is an echo", () => {
    expect(reconcile("a", "a", "a")).toBe("echo");
    // Our own write coming back while the user has typed past it.
    expect(reconcile("a", "ab", "a")).toBe("echo");
  });

  test("adopts an external change the draft has nothing to lose to", () => {
    expect(reconcile("new", "old", "old")).toBe("adopt");
  });

  test("a draft with unsaved edits conflicts with an external change", () => {
    expect(reconcile("theirs", "mine", "was")).toBe("conflict");
  });

  test("a draft that already spells the external value is converged", () => {
    expect(reconcile("same", "same", "was")).toBe("converged");
  });
});

describe("mapCaret", () => {
  test("an edit after the caret leaves it alone", () => {
    expect(mapCaret("ab", "abcd", 1)).toBe(1);
  });

  test("an edit before the caret shifts it by the length delta", () => {
    expect(mapCaret("bc", "abc", 2)).toBe(3);
    expect(mapCaret("xxbc", "bc", 4)).toBe(2);
  });

  test("a caret inside the replaced text lands at the end of what replaced it", () => {
    // "aXXXb" → "aYb": the caret sat in the XXX that no longer exists.
    expect(mapCaret("aXXXb", "aYb", 3)).toBe(2);
  });

  test("the end of the text stays the end of the text", () => {
    expect(mapCaret("hello", "hi", 5)).toBe(2);
    expect(mapCaret("", "seeded", 0)).toBe(0);
  });

  test("an out-of-range offset is clamped into the old text", () => {
    // 99 clamps to 2 (the end of "ab"), which sits BEFORE the appended "c" —
    // text arriving past the caret never drags the caret along with it.
    expect(mapCaret("ab", "abc", 99)).toBe(2);
    expect(mapCaret("ab", "abc", -3)).toBe(0);
  });
});
