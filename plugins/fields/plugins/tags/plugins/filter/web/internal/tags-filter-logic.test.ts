import { describe, expect, it } from "bun:test";
import {
  contains,
  doesNotContain,
  containsAnyOf,
  containsAllOf,
  isEmpty,
  isNotEmpty,
} from "./tags-filter-logic";

describe("tags filter operators", () => {
  it("contains / does-not-contain (single tag)", () => {
    expect(contains("a", ["a", "b"])).toBe(true);
    expect(contains("c", ["a", "b"])).toBe(false);
    expect(contains("", ["a"])).toBe(true); // empty operand → keep
    expect(doesNotContain("c", ["a", "b"])).toBe(true);
    expect(doesNotContain("a", ["a", "b"])).toBe(false);
  });

  it("contains-any-of (match-any)", () => {
    expect(containsAnyOf(["a", "z"], ["a", "b"])).toBe(true);
    expect(containsAnyOf(["x", "z"], ["a", "b"])).toBe(false);
    expect(containsAnyOf([], ["a"])).toBe(true);
  });

  it("contains-all-of (match-all)", () => {
    expect(containsAllOf(["a", "b"], ["a", "b", "c"])).toBe(true);
    expect(containsAllOf(["a", "z"], ["a", "b"])).toBe(false);
    expect(containsAllOf([], ["a"])).toBe(true);
  });

  it("non-array field → empty tag set", () => {
    expect(contains("a", null)).toBe(false);
    expect(containsAnyOf(["a"], "a")).toBe(false);
  });

  it("is-empty / is-not-empty", () => {
    expect(isEmpty(undefined, [])).toBe(true);
    expect(isEmpty(undefined, null)).toBe(true);
    expect(isEmpty(undefined, ["a"])).toBe(false);
    expect(isNotEmpty(undefined, ["a"])).toBe(true);
    expect(isNotEmpty(undefined, [])).toBe(false);
  });
});
