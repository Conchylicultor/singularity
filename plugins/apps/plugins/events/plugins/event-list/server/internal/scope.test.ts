import { describe, expect, test } from "bun:test";
import {
  and,
  clause,
  or,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  filterMentionsField,
  shouldHideDisappeared,
  shouldHideInactiveSources,
} from "./scope";

describe("filterMentionsField", () => {
  test("no filter mentions nothing", () => {
    expect(filterMentionsField(undefined, "disappearedAt")).toBe(false);
  });

  test("a top-level clause on the column", () => {
    expect(
      filterMentionsField(clause("disappearedAt", "isEmpty"), "disappearedAt"),
    ).toBe(true);
  });

  test("a clause on another column does not count", () => {
    expect(
      filterMentionsField(clause("city", "eqCi", "Paris"), "disappearedAt"),
    ).toBe(false);
  });

  test("finds the clause nested in a sub-group", () => {
    const f = and(
      clause("city", "eqCi", "Paris"),
      or(
        clause("category", "eq", "club"),
        clause("disappearedAt", "isNotEmpty"),
      ),
    );
    expect(filterMentionsField(f, "disappearedAt")).toBe(true);
  });
});

describe("shouldHideDisappeared", () => {
  test("hides by default", () => {
    expect(shouldHideDisappeared(undefined)).toBe(true);
    expect(shouldHideDisappeared(clause("city", "eqCi", "Lyon"))).toBe(true);
  });

  test("any clause on disappearedAt yields the default — both directions", () => {
    for (const op of ["isEmpty", "isNotEmpty"] as const) {
      expect(shouldHideDisappeared(clause("disappearedAt", op))).toBe(false);
    }
  });
});

describe("shouldHideInactiveSources", () => {
  test("hides by default", () => {
    expect(shouldHideInactiveSources(undefined)).toBe(true);
    expect(shouldHideInactiveSources(clause("city", "eqCi", "Lyon"))).toBe(
      true,
    );
  });

  test("any clause on sourceId yields the default — whichever op", () => {
    for (const f of [
      clause("sourceId", "eq", "s1"),
      clause("sourceId", "ne", "s1"),
      clause("sourceId", "isNotEmpty"),
    ]) {
      expect(shouldHideInactiveSources(f)).toBe(false);
    }
  });

  // The two defaults are independent: naming one dimension must not disarm the
  // other's.
  test("a disappearedAt clause does not disarm this default", () => {
    const f = clause("disappearedAt", "isNotEmpty");
    expect(shouldHideInactiveSources(f)).toBe(true);
    expect(shouldHideDisappeared(f)).toBe(false);
  });
});
