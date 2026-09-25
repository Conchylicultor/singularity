import { describe, expect, it } from "bun:test";
import { lowersToMatch } from "@plugins/primitives/plugins/data-view/web/testing";
import type { FilterFieldValue } from "@plugins/primitives/plugins/data-view/core";
import { tagsLower } from "./tags-lower";

const keeps = (
  op: keyof typeof tagsLower,
  operand: unknown,
  value: FilterFieldValue,
) => lowersToMatch({ lower: tagsLower[op] }, "stringArray", operand, value);

describe("tags operators lowered", () => {
  it("contains / does-not-contain (single tag)", () => {
    expect(keeps("contains", "a", ["a", "b"])).toBe(true);
    expect(keeps("contains", "c", ["a", "b"])).toBe(false);
    expect(keeps("contains", "", ["a"])).toBe(true); // empty operand → keep
    expect(keeps("does-not-contain", "c", ["a", "b"])).toBe(true);
    expect(keeps("does-not-contain", "a", ["a", "b"])).toBe(false);
  });

  it("contains-any-of (match-any)", () => {
    expect(keeps("contains-any-of", ["a", "z"], ["a", "b"])).toBe(true);
    expect(keeps("contains-any-of", ["x", "z"], ["a", "b"])).toBe(false);
    expect(keeps("contains-any-of", [], ["a"])).toBe(true);
  });

  it("contains-all-of (match-all)", () => {
    expect(keeps("contains-all-of", ["a", "b"], ["a", "b", "c"])).toBe(true);
    expect(keeps("contains-all-of", ["a", "z"], ["a", "b"])).toBe(false);
    expect(keeps("contains-all-of", [], ["a"])).toBe(true);
  });

  it("non-array field → no tag set", () => {
    expect(keeps("contains", "a", null)).toBe(false);
    expect(keeps("contains-any-of", ["a"], "a")).toBe(false);
    expect(keeps("does-not-contain", "a", null)).toBe(true);
  });

  it("is-empty / is-not-empty", () => {
    expect(keeps("is-empty", undefined, [])).toBe(true);
    expect(keeps("is-empty", undefined, null)).toBe(true);
    expect(keeps("is-empty", undefined, ["a"])).toBe(false);
    expect(keeps("is-not-empty", undefined, ["a"])).toBe(true);
    expect(keeps("is-not-empty", undefined, [])).toBe(false);
  });

  it("lowers a single tag to a one-element list", () => {
    expect(tagsLower.contains("a", { column: "tags", now: 0 })).toEqual({
      column: "tags",
      op: "hasAll",
      operand: ["a"],
    });
  });
});
