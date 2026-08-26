import { describe, expect, test } from "bun:test";
import { selfClass, type StackAlign } from "./stack";

/**
 * The compile-time half of this suite. A sixth `StackAlign` that gains an
 * `items-*` twin in `ALIGN_CLASS` and no `self-*` twin in `SELF_CLASS` fails
 * `type-check` here, before any test runs — the two maps are one decision seen
 * from the container and from the child, so they must not drift.
 */
const ALL_ALIGNS = [
  "start",
  "center",
  "end",
  "stretch",
  "baseline",
] as const satisfies readonly StackAlign[];

type _Exhaustive =
  Exclude<StackAlign, (typeof ALL_ALIGNS)[number]> extends never
    ? true
    : ["StackAlign gained a member with no selfClass twin", never];

/** The line that makes the guard above bite: it demands `true` of the alias. */
const EXHAUSTIVE: _Exhaustive = true;

describe("selfClass", () => {
  test("each align maps to its self-* twin of Stack's items-* class", () => {
    expect(selfClass("start")).toBe("self-start");
    expect(selfClass("center")).toBe("self-center");
    expect(selfClass("end")).toBe("self-end");
    expect(selfClass("stretch")).toBe("self-stretch");
    expect(selfClass("baseline")).toBe("self-baseline");
  });

  test("it emits exactly ONE class — an override, not a bundle", () => {
    // A per-child override says where this one child sits and nothing else.
    // Bundling anything alongside it (a shrink policy, a min-*-0) would make
    // the helper unusable at the sites that already own those decisions.
    for (const align of ALL_ALIGNS) {
      expect(selfClass(align).split(" ")).toHaveLength(1);
    }
  });

  test("every align is covered, with no map hole", () => {
    expect(EXHAUSTIVE).toBe(true);
    for (const align of ALL_ALIGNS) {
      expect(selfClass(align)).toBe(`self-${align}`);
    }
  });
});
