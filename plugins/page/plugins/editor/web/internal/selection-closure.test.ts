import { describe, expect, test } from "bun:test";
import { rangeWithDescendants, type VisibleBlock } from "./selection-closure";

/**
 * A visible block list written the way it reads on screen: one entry per line,
 * indentation is depth.
 *
 *   list("xxx", " yyy", " zzz")  →  xxx(0) yyy(1) zzz(1)
 */
function list(...lines: string[]): VisibleBlock[] {
  return lines.map((line) => ({
    id: line.trim(),
    depth: line.length - line.trimStart().length,
  }));
}

/** The ids the closed range covers, in document order. */
function covered(
  visible: VisibleBlock[],
  anchor: string,
  head: string,
): string[] {
  const closed = rangeWithDescendants(visible, { anchor, head });
  const a = visible.findIndex((v) => v.id === closed.anchor);
  const h = visible.findIndex((v) => v.id === closed.head);
  if (a === -1 || h === -1) return [];
  return visible.slice(Math.min(a, h), Math.max(a, h) + 1).map((v) => v.id);
}

describe("rangeWithDescendants", () => {
  // The reported bug: selecting a parent and its first child, then pressing
  // Backspace, deleted the second child too — because deleting acts on the
  // subtree while the selection showed two of its three blocks.
  test("a parent drags its remaining children into the selection", () => {
    const visible = list("xxx", " yyy", " zzz", "www");

    expect(covered(visible, "xxx", "yyy")).toEqual(["xxx", "yyy", "zzz"]);
  });

  test("selecting a parent alone still covers its whole subtree", () => {
    const visible = list("xxx", " yyy", "  deep", " zzz", "www");

    expect(covered(visible, "xxx", "xxx")).toEqual([
      "xxx",
      "yyy",
      "deep",
      "zzz",
    ]);
  });

  // Selection closes downward only: a child never pulls its parent in, because
  // acting on the child leaves the parent where it is.
  test("a child does not select its parent", () => {
    const visible = list("xxx", " yyy", " zzz");

    expect(covered(visible, "yyy", "yyy")).toEqual(["yyy"]);
    expect(covered(visible, "yyy", "zzz")).toEqual(["yyy", "zzz"]);
  });

  test("a range of leaves is left exactly as it is", () => {
    const visible = list("a", "b", "c");

    expect(rangeWithDescendants(visible, { anchor: "a", head: "b" })).toEqual({
      anchor: "a",
      head: "b",
    });
  });

  // The shallowest block in the range is the one that reaches furthest, and it
  // is not necessarily either end of it.
  test("the range's shallowest block sets how far the closure reaches", () => {
    const visible = list("a", " deep", "b", " kid", "  grandkid", "c");

    expect(covered(visible, "deep", "b")).toEqual([
      "deep",
      "b",
      "kid",
      "grandkid",
    ]);
  });

  // An upward range grows at its anchor, because the anchor is its bottom end.
  test("an upward range keeps its head and extends its anchor", () => {
    const visible = list("xxx", " yyy", " zzz", "www");

    expect(
      rangeWithDescendants(visible, { anchor: "yyy", head: "xxx" }),
    ).toEqual({ anchor: "zzz", head: "xxx" });
    expect(covered(visible, "yyy", "xxx")).toEqual(["xxx", "yyy", "zzz"]);
  });

  // Idempotence is what lets the closure sit in `applyRange`, which re-applies
  // the range it just stored on every pointermove of a marquee drag.
  test("a closed range is already closed", () => {
    const visible = list("xxx", " yyy", " zzz", "www");
    const once = rangeWithDescendants(visible, { anchor: "xxx", head: "xxx" });

    expect(rangeWithDescendants(visible, once)).toEqual(once);
  });

  test("the last block in the list has nothing below it to gather", () => {
    const visible = list("a", " b");

    expect(covered(visible, "b", "b")).toEqual(["b"]);
    expect(covered(visible, "a", "b")).toEqual(["a", "b"]);
  });

  // A range naming a block that is not on screen (a stale id, a block deleted
  // under a live selection) has no visible descendants to add.
  test("an unknown id comes back untouched", () => {
    const visible = list("a", " b");

    expect(
      rangeWithDescendants(visible, { anchor: "gone", head: "a" }),
    ).toEqual({ anchor: "gone", head: "a" });
    expect(
      rangeWithDescendants(visible, { anchor: "a", head: "gone" }),
    ).toEqual({ anchor: "a", head: "gone" });
  });

  test("an empty list is not a crash", () => {
    expect(rangeWithDescendants([], { anchor: "a", head: "a" })).toEqual({
      anchor: "a",
      head: "a",
    });
  });
});
