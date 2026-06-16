import { describe, expect, it } from "bun:test";
import { isFilterGroup } from "./filter-shape";

describe("isFilterGroup", () => {
  it("accepts a valid empty group", () => {
    expect(
      isFilterGroup({ kind: "group", id: "g", conjunction: "and", children: [] }),
    ).toBe(true);
  });

  it("accepts a group with a valid rule and nested group", () => {
    expect(
      isFilterGroup({
        kind: "group",
        id: "g",
        conjunction: "or",
        children: [
          { kind: "rule", id: "r1", fieldId: "name", operatorId: "contains" },
          {
            kind: "rule",
            id: "r2",
            fieldId: "age",
            operatorId: ">",
            value: 5,
          },
          {
            kind: "group",
            id: "g2",
            conjunction: "and",
            children: [
              { kind: "rule", id: "r3", fieldId: "x", operatorId: "is" },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects the stale Record<fieldId, value> shape", () => {
    expect(isFilterGroup({ name: { contains: "foo" } })).toBe(false);
  });

  it("rejects null / non-objects", () => {
    expect(isFilterGroup(null)).toBe(false);
    expect(isFilterGroup(undefined)).toBe(false);
    expect(isFilterGroup("group")).toBe(false);
    expect(isFilterGroup(42)).toBe(false);
  });

  it("rejects a bad conjunction", () => {
    expect(
      isFilterGroup({ kind: "group", id: "g", conjunction: "xor", children: [] }),
    ).toBe(false);
  });

  it("rejects missing children array", () => {
    expect(
      isFilterGroup({ kind: "group", id: "g", conjunction: "and" }),
    ).toBe(false);
  });

  it("rejects a group containing an invalid rule", () => {
    expect(
      isFilterGroup({
        kind: "group",
        id: "g",
        conjunction: "and",
        children: [{ kind: "rule", id: "r", fieldId: "x" }], // missing operatorId
      }),
    ).toBe(false);
  });

  it("rejects a child with an unknown kind", () => {
    expect(
      isFilterGroup({
        kind: "group",
        id: "g",
        conjunction: "and",
        children: [{ kind: "wat", id: "r" }],
      }),
    ).toBe(false);
  });
});
