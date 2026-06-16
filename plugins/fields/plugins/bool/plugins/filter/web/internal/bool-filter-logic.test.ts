import { describe, expect, it } from "bun:test";
import { is, isNot } from "./bool-filter-logic";

describe("bool filter operators", () => {
  it("is (checked / unchecked)", () => {
    expect(is(true, true)).toBe(true);
    expect(is(true, false)).toBe(false);
    expect(is(false, false)).toBe(true);
    expect(is(false, true)).toBe(false);
  });

  it("treats falsy field values as unchecked", () => {
    expect(is(false, null)).toBe(true);
    expect(is(false, undefined)).toBe(true);
    expect(is(true, null)).toBe(false);
  });

  it("unset operand defaults to unchecked", () => {
    expect(is(undefined, false)).toBe(true);
    expect(is(undefined, true)).toBe(false);
  });

  it("is-not", () => {
    expect(isNot(true, false)).toBe(true);
    expect(isNot(true, true)).toBe(false);
    expect(isNot(false, true)).toBe(true);
  });
});
