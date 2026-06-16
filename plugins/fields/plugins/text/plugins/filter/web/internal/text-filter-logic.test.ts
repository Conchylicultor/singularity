import { describe, expect, it } from "bun:test";
import {
  contains,
  doesNotContain,
  is,
  isNot,
  isEmpty,
  isNotEmpty,
} from "./text-filter-logic";

describe("text filter operators", () => {
  it("contains (case-insensitive, empty operand → keep)", () => {
    expect(contains("AN", "Annie")).toBe(true);
    expect(contains("xyz", "Annie")).toBe(false);
    expect(contains("", "Annie")).toBe(true);
    expect(contains("an", null)).toBe(false);
  });

  it("does-not-contain", () => {
    expect(doesNotContain("xyz", "Annie")).toBe(true);
    expect(doesNotContain("an", "Annie")).toBe(false);
    expect(doesNotContain("", "Annie")).toBe(true);
    expect(doesNotContain("x", null)).toBe(true);
  });

  it("is / is-not (case-insensitive)", () => {
    expect(is("annie", "Annie")).toBe(true);
    expect(is("bob", "Annie")).toBe(false);
    expect(is("", "Annie")).toBe(true);
    expect(isNot("bob", "Annie")).toBe(true);
    expect(isNot("annie", "Annie")).toBe(false);
  });

  it("is-empty / is-not-empty", () => {
    expect(isEmpty(undefined, "")).toBe(true);
    expect(isEmpty(undefined, null)).toBe(true);
    expect(isEmpty(undefined, "  ")).toBe(true);
    expect(isEmpty(undefined, "x")).toBe(false);
    expect(isNotEmpty(undefined, "x")).toBe(true);
    expect(isNotEmpty(undefined, "")).toBe(false);
  });
});
