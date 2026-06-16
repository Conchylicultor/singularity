import { describe, expect, it } from "bun:test";
import { evaluateNode, applyFilter } from "./evaluate-filter";
import type {
  FieldDef,
  FilterGroup,
  FilterOperatorSet,
} from "../../core";

interface Row {
  name: string;
  age: number;
}

const fields: FieldDef<Row>[] = [
  { id: "name", label: "Name", type: "text", value: (r) => r.name },
  { id: "age", label: "Age", type: "number", value: (r) => r.age },
];

// Minimal operator sets: text "contains", number ">".
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
  number: {
    match: "number",
    operators: [
      {
        id: ">",
        label: ">",
        hasValue: true,
        predicate: (op, fv) =>
          typeof fv === "number" && typeof op === "number" && fv > op,
      },
    ],
  },
};

const resolve = (typeId: string): FilterOperatorSet | undefined =>
  sets[typeId];

const rule = (fieldId: string, operatorId: string, value: unknown) =>
  ({ kind: "rule", id: `${fieldId}-${operatorId}`, fieldId, operatorId, value }) as const;

const group = (
  conjunction: "and" | "or",
  children: FilterGroup["children"],
): FilterGroup => ({ kind: "group", id: "g", conjunction, children });

const ann: Row = { name: "Annie", age: 40 };
const bob: Row = { name: "Bob", age: 10 };

describe("evaluateNode", () => {
  it("empty group → true", () => {
    expect(evaluateNode(group("and", []), ann, fields, resolve)).toBe(true);
    expect(evaluateNode(group("or", []), ann, fields, resolve)).toBe(true);
  });

  it("AND requires every child", () => {
    const g = group("and", [
      rule("name", "contains", "ann"),
      rule("age", ">", 20),
    ]);
    expect(evaluateNode(g, ann, fields, resolve)).toBe(true);
    expect(evaluateNode(g, bob, fields, resolve)).toBe(false); // fails both
  });

  it("OR requires some child", () => {
    const g = group("or", [
      rule("name", "contains", "ann"),
      rule("age", ">", 20),
    ]);
    expect(evaluateNode(g, ann, fields, resolve)).toBe(true);
    expect(evaluateNode(g, bob, fields, resolve)).toBe(false); // fails both
    // bob matches via name OR
    const g2 = group("or", [
      rule("name", "contains", "bob"),
      rule("age", ">", 99),
    ]);
    expect(evaluateNode(g2, bob, fields, resolve)).toBe(true);
  });

  it("nests groups", () => {
    const g = group("and", [
      rule("name", "contains", "b"),
      group("or", [rule("age", ">", 100), rule("age", ">", 5)]),
    ]);
    expect(evaluateNode(g, bob, fields, resolve)).toBe(true); // name has b, age>5
  });

  it("missing field → rule is a no-op (true)", () => {
    const g = group("and", [rule("nope", "contains", "x")]);
    expect(evaluateNode(g, ann, fields, resolve)).toBe(true);
  });

  it("missing operator → rule is a no-op (true)", () => {
    const g = group("and", [rule("name", "no-such-op", "x")]);
    expect(evaluateNode(g, ann, fields, resolve)).toBe(true);
  });

  it("unresolved operator set → rule is a no-op (true)", () => {
    const noResolve = () => undefined;
    const g = group("and", [rule("name", "contains", "zzz")]);
    expect(evaluateNode(g, ann, fields, noResolve)).toBe(true);
  });
});

describe("applyFilter", () => {
  const rows = [ann, bob];

  it("null filter keeps every row", () => {
    expect(applyFilter(rows, null, fields, resolve)).toEqual(rows);
  });

  it("filters rows through the tree", () => {
    const g = group("and", [rule("age", ">", 20)]);
    expect(applyFilter(rows, g, fields, resolve)).toEqual([ann]);
  });
});
