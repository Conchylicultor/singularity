import { describe, expect, it } from "bun:test";
import { hasOperand, isOperatorComplete, isRuleActive } from "./rule-resolution";
import { evaluateNode } from "./evaluate-filter";
import type { FieldDef, FilterOperatorSet, FilterRule } from "../../core";

interface Row {
  name: string;
  modified: boolean;
}

const fields: FieldDef<Row>[] = [
  { id: "name", label: "Name", type: "text", value: (r) => r.name },
  { id: "modified", label: "Modified", type: "bool", value: (r) => r.modified },
];

// text "contains" → generic completeness (needs a present operand).
// bool "is" → operator-owned completeness: an absent value reads as "Unchecked",
// so the rule is complete (and filters) even with no stored value.
const sets: Record<string, FilterOperatorSet> = {
  text: {
    match: "text",
    operators: [
      {
        id: "contains",
        label: "Contains",
        hasValue: true,
        predicate: (op, fv) =>
          String(fv ?? "")
            .toLowerCase()
            .includes(String(op ?? "").toLowerCase()),
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
        predicate: (op, fv) => Boolean(fv) === (op === true),
        isComplete: () => true,
      },
    ],
  },
};
const resolve = (typeId: string) => sets[typeId];

const rule = (fieldId: string, operatorId: string, value?: unknown): FilterRule => ({
  kind: "rule",
  id: `${fieldId}-${operatorId}`,
  fieldId,
  operatorId,
  ...(value === undefined ? {} : { value }),
});

describe("hasOperand", () => {
  it("treats null/undefined/empty-string/empty-array as absent", () => {
    expect(hasOperand(undefined)).toBe(false);
    expect(hasOperand(null)).toBe(false);
    expect(hasOperand("")).toBe(false);
    expect(hasOperand([])).toBe(false);
  });
  it("treats false/0/non-empty as present", () => {
    expect(hasOperand(false)).toBe(true);
    expect(hasOperand(0)).toBe(true);
    expect(hasOperand("x")).toBe(true);
  });
});

describe("isOperatorComplete — operator owns completeness", () => {
  const textOp = sets.text!.operators[0]!;
  const boolOp = sets.bool!.operators[0]!;

  it("value-taking operator with no operand is incomplete by default", () => {
    expect(isOperatorComplete(textOp, undefined)).toBe(false);
    expect(isOperatorComplete(textOp, "ann")).toBe(true);
  });

  it("operator's own isComplete overrides the default (bool stays complete)", () => {
    expect(isOperatorComplete(boolOp, undefined)).toBe(true);
    expect(isOperatorComplete(boolOp, false)).toBe(true);
  });
});

// The regression: count and filter must AGREE for every rule. A value-less bool
// rule both counts and filters; a value-less text rule neither counts nor filters.
describe("count ⇔ filter parity (the chip-vs-filter bug)", () => {
  const modifiedRow: Row = { name: "preprompts", modified: true };
  const cleanRow: Row = { name: "categorical", modified: false };

  it("value-less bool rule is active AND filters", () => {
    const r = rule("modified", "is"); // no value → "Unchecked"
    expect(isRuleActive(r, fields, resolve)).toBe(true); // chip counts it
    expect(evaluateNode(r, modifiedRow, fields, resolve)).toBe(false); // hides modified
    expect(evaluateNode(r, cleanRow, fields, resolve)).toBe(true); // keeps clean
  });

  it("value-less text rule is inactive AND no-ops", () => {
    const r = rule("name", "contains"); // no value
    expect(isRuleActive(r, fields, resolve)).toBe(false); // chip ignores it
    expect(evaluateNode(r, modifiedRow, fields, resolve)).toBe(true); // no-op
  });

  it("unresolvable rule is inactive AND no-ops", () => {
    const r = rule("nope", "contains", "x");
    expect(isRuleActive(r, fields, resolve)).toBe(false);
    expect(evaluateNode(r, modifiedRow, fields, resolve)).toBe(true);
  });
});
