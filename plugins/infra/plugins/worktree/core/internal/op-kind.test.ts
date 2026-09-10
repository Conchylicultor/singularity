import { describe, expect, test } from "bun:test";
import { OP_KIND_IDS, OP_KINDS, isOpKind } from "./op-kind";

describe("op-kind", () => {
  test("OP_KIND_IDS is exactly the declaration's keys, no duplicates", () => {
    expect(OP_KIND_IDS).toEqual(Object.keys(OP_KINDS) as typeof OP_KIND_IDS);
    expect(new Set(OP_KIND_IDS).size).toBe(OP_KIND_IDS.length);
  });

  test("isOpKind accepts every declared kind and rejects the rest", () => {
    for (const id of OP_KIND_IDS) expect(isOpKind(id)).toBe(true);
    expect(isOpKind("")).toBe(false);
    expect(isOpKind("deploy")).toBe(false);
    // A prototype property is not a kind.
    expect(isOpKind("toString")).toBe(false);
  });

  test("every kind carries a label and a progressive verb", () => {
    for (const id of OP_KIND_IDS) {
      expect(OP_KINDS[id].label.length).toBeGreaterThan(0);
      expect(OP_KINDS[id].progressive.length).toBeGreaterThan(0);
    }
  });
});
