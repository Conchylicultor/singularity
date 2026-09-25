import { describe, expect, it } from "bun:test";
import { clause } from "@plugins/network/plugins/live/plugins/filter/core";
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

/** A value-taking stand-in: complete iff the operand is present. */
const needsOperand = (operand: unknown, { column }: { column: string }) =>
  operand === undefined ||
  operand === null ||
  operand === "" ||
  (Array.isArray(operand) && operand.length === 0)
    ? undefined
    : clause(column, "isNotEmpty");
const always = (_operand: unknown, { column }: { column: string }) =>
  clause(column, "isEmpty");

const sets: Record<string, FilterOperatorSet> = {
  enum: {
    match: "enum",
    domain: "text",
    operators: [
      { id: "is", label: "Is", hasValue: true, lower: needsOperand },
      {
        id: "none-of",
        label: "Is none of",
        hasValue: true,
        lower: needsOperand,
      },
    ],
  },
  text: {
    match: "text",
    domain: "text",
    operators: [
      {
        id: "contains",
        label: "Contains",
        hasValue: true,
        lower: needsOperand,
      },
      {
        id: "empty",
        label: "Is empty",
        hasValue: false,
        lower: always,
      },
    ],
  },
  bool: {
    match: "bool",
    domain: "boolean",
    operators: [
      {
        id: "is",
        label: "Is",
        hasValue: true,
        // The `bool` shape that made the count and the evaluator disagree: an
        // absent operand still means something ("Unchecked"), so the rule
        // lowers (is complete) and filters.
        lower: always,
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
