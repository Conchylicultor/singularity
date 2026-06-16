import { describe, expect, it } from "bun:test";
import {
  eq,
  neq,
  gt,
  lt,
  gte,
  lte,
  between,
  isEmpty,
  isNotEmpty,
} from "./number-filter-logic";

describe("number filter operators", () => {
  it("= / ≠", () => {
    expect(eq(5, 5)).toBe(true);
    expect(eq(5, 6)).toBe(false);
    expect(neq(5, 6)).toBe(true);
    expect(neq(5, 5)).toBe(false);
  });

  it("> < ≥ ≤", () => {
    expect(gt(5, 10)).toBe(true);
    expect(gt(5, 5)).toBe(false);
    expect(lt(5, 1)).toBe(true);
    expect(gte(5, 5)).toBe(true);
    expect(lte(5, 5)).toBe(true);
    expect(lte(5, 6)).toBe(false);
  });

  it("empty operand → keep (incomplete rule)", () => {
    expect(eq(undefined, 5)).toBe(true);
    expect(gt(null, 5)).toBe(true);
  });

  it("non-numeric field value → drop (when operand present)", () => {
    expect(eq(5, null)).toBe(false);
    expect(gt(5, "x")).toBe(false);
  });

  it("between (inclusive, open bounds)", () => {
    expect(between({ min: 1, max: 10 }, 5)).toBe(true);
    expect(between({ min: 1, max: 10 }, 1)).toBe(true);
    expect(between({ min: 1, max: 10 }, 10)).toBe(true);
    expect(between({ min: 1, max: 10 }, 11)).toBe(false);
    expect(between({ min: 5 }, 7)).toBe(true);
    expect(between({ max: 5 }, 7)).toBe(false);
    expect(between({}, 7)).toBe(true); // no bounds → keep
    expect(between({ min: 1 }, null)).toBe(false);
  });

  it("is-empty / is-not-empty", () => {
    expect(isEmpty(undefined, null)).toBe(true);
    expect(isEmpty(undefined, undefined)).toBe(true);
    expect(isEmpty(undefined, 0)).toBe(false);
    expect(isNotEmpty(undefined, 0)).toBe(true);
    expect(isNotEmpty(undefined, null)).toBe(false);
  });
});
