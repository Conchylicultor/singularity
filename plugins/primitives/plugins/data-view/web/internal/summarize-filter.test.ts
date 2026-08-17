import { describe, expect, it } from "bun:test";
import type {
  FieldDef,
  FilterGroup,
  FilterNode,
  FilterOperatorSet,
} from "../../core";
import { summarizeFilter } from "./summarize-filter";

const fields: FieldDef<unknown>[] = [
  {
    id: "status",
    label: "Status",
    type: "enum",
    value: () => "",
    options: [
      { value: "open", label: "Open" },
      { value: "done", label: "Done" },
    ],
  },
  { id: "title", label: "Title", type: "text", value: () => "" },
  { id: "starred", label: "Starred", type: "bool", value: () => false },
];

const sets: Record<string, FilterOperatorSet> = {
  enum: {
    match: "enum",
    operators: [
      { id: "is", label: "Is", hasValue: true, predicate: () => true },
      {
        id: "none-of",
        label: "Is none of",
        hasValue: true,
        predicate: () => true,
      },
    ],
  },
  text: {
    match: "text",
    operators: [
      {
        id: "contains",
        label: "Contains",
        hasValue: true,
        predicate: () => true,
      },
      {
        id: "empty",
        label: "Is empty",
        hasValue: false,
        predicate: () => true,
      },
    ],
  },
  bool: {
    match: "bool",
    operators: [
      {
        id: "is",
        label: "Is",
        hasValue: true,
        // The `bool` shape that made the count and the evaluator disagree: an
        // absent operand still means something ("Unchecked"), so the rule filters.
        isComplete: () => true,
        predicate: () => true,
        summarize: (operand) => (operand === true ? "checked" : "unchecked"),
      },
    ],
  },
};
const resolve = (typeId: string): FilterOperatorSet | undefined => sets[typeId];

let uid = 0;
function rule(
  fieldId: string,
  operatorId: string,
  value?: unknown,
): FilterNode {
  return { kind: "rule", id: `r${++uid}`, fieldId, operatorId, value };
}
function group(...children: FilterNode[]): FilterGroup {
  return { kind: "group", id: `g${++uid}`, conjunction: "and", children };
}

describe("summarizeFilter", () => {
  it("says nothing when there is no filter at all", () => {
    expect(summarizeFilter(null, fields, resolve)).toBeNull();
  });

  it("says nothing when every rule is incomplete", () => {
    // A `contains` rule with no operand does not constrain rows, so a chip
    // announcing it would claim a narrowing that is not happening.
    const g = group(rule("title", "contains", ""));
    expect(summarizeFilter(g, fields, resolve)).toBeNull();
  });

  it("describes the first active rule in words", () => {
    const g = group(rule("title", "contains", "hello"));
    expect(summarizeFilter(g, fields, resolve)).toEqual({
      label: "Title contains hello",
      more: 0,
    });
  });

  it("collapses a multi-value operand to its count", () => {
    const g = group(rule("status", "none-of", ["open", "done"]));
    expect(summarizeFilter(g, fields, resolve)?.label).toBe(
      "Status is none of 2",
    );
  });

  it("names a single-value operand by its option label, not its stored id", () => {
    const g = group(rule("status", "is", ["done"]));
    expect(summarizeFilter(g, fields, resolve)?.label).toBe("Status is Done");
  });

  it("omits the operand for a value-less operator", () => {
    const g = group(rule("title", "empty"));
    expect(summarizeFilter(g, fields, resolve)?.label).toBe("Title is empty");
  });

  it("prefers the operator's own summarize() over the generic fallback", () => {
    const g = group(rule("starred", "is", undefined));
    expect(summarizeFilter(g, fields, resolve)?.label).toBe(
      "Starred is unchecked",
    );
  });

  it("counts the remaining active rules as `more`, flattening nested groups", () => {
    const g = group(
      rule("title", "contains", "a"),
      group(rule("status", "is", ["open"]), rule("starred", "is", true)),
    );
    expect(summarizeFilter(g, fields, resolve)).toEqual({
      label: "Title contains a",
      more: 2,
    });
  });

  it("skips inactive rules when picking the first AND when counting", () => {
    // Exactly the invariant the shared `isRuleActive` exists for: the chip and
    // the evaluator ask the same question, so an incomplete rule is invisible to
    // both. Here the leading rule is incomplete, so the SECOND one is described.
    const g = group(
      rule("title", "contains", ""),
      rule("status", "is", ["open"]),
      rule("title", "contains", ""),
    );
    expect(summarizeFilter(g, fields, resolve)).toEqual({
      label: "Status is Open",
      more: 0,
    });
  });

  it("ignores a rule whose field or operator no longer exists", () => {
    const g = group(
      rule("gone", "contains", "x"),
      rule("title", "no-such-op", "x"),
    );
    expect(summarizeFilter(g, fields, resolve)).toBeNull();
  });

  it("omits an operand it has no readable form for", () => {
    const g = group(rule("title", "contains", { from: 1, to: 2 }));
    expect(summarizeFilter(g, fields, resolve)?.label).toBe("Title contains");
  });
});
