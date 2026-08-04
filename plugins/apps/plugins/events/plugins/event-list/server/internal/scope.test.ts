import { describe, expect, test } from "bun:test";
import type { FilterGroup } from "@plugins/primitives/plugins/data-view/core";
import { filterMentionsField, shouldHideDisappeared } from "./scope";

function group(children: FilterGroup["children"]): FilterGroup {
  return { kind: "group", id: "g", conjunction: "and", children };
}

describe("filterMentionsField", () => {
  test("null tree mentions nothing", () => {
    expect(filterMentionsField(null, "disappearedAt")).toBe(false);
  });

  test("empty group mentions nothing", () => {
    expect(filterMentionsField(group([]), "disappearedAt")).toBe(false);
  });

  test("a top-level rule on the field", () => {
    const f = group([
      { kind: "rule", id: "r1", fieldId: "disappearedAt", operatorId: "is-empty" },
    ]);
    expect(filterMentionsField(f, "disappearedAt")).toBe(true);
  });

  test("a rule on another field does not count", () => {
    const f = group([
      { kind: "rule", id: "r1", fieldId: "city", operatorId: "is", value: "Paris" },
    ]);
    expect(filterMentionsField(f, "disappearedAt")).toBe(false);
  });

  test("finds the rule nested in a sub-group", () => {
    const f = group([
      { kind: "rule", id: "r1", fieldId: "city", operatorId: "is", value: "Paris" },
      {
        kind: "group",
        id: "g2",
        conjunction: "or",
        children: [
          { kind: "rule", id: "r2", fieldId: "category", operatorId: "is", value: "club" },
          { kind: "rule", id: "r3", fieldId: "disappearedAt", operatorId: "is-not-empty" },
        ],
      },
    ]);
    expect(filterMentionsField(f, "disappearedAt")).toBe(true);
  });
});

describe("shouldHideDisappeared", () => {
  test("hides by default", () => {
    expect(shouldHideDisappeared(null)).toBe(true);
    expect(shouldHideDisappeared(group([]))).toBe(true);
    expect(
      shouldHideDisappeared(
        group([{ kind: "rule", id: "r", fieldId: "city", operatorId: "is", value: "Lyon" }]),
      ),
    ).toBe(true);
  });

  test("any rule on disappearedAt yields the default — both directions", () => {
    for (const operatorId of ["is-empty", "is-not-empty"]) {
      expect(
        shouldHideDisappeared(
          group([{ kind: "rule", id: "r", fieldId: "disappearedAt", operatorId }]),
        ),
      ).toBe(false);
    }
  });
});
