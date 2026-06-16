import { describe, expect, it } from "bun:test";
import {
  is,
  isNot,
  isAnyOf,
  isNoneOf,
  isEmpty,
  isNotEmpty,
} from "./enum-filter-logic";

describe("enum filter operators", () => {
  it("is / is-not", () => {
    expect(is("open", "open")).toBe(true);
    expect(is("open", "closed")).toBe(false);
    expect(is("", "open")).toBe(true); // empty operand → keep
    expect(isNot("closed", "open")).toBe(true);
    expect(isNot("open", "open")).toBe(false);
  });

  it("is-any-of", () => {
    expect(isAnyOf(["open", "wip"], "wip")).toBe(true);
    expect(isAnyOf(["open", "wip"], "done")).toBe(false);
    expect(isAnyOf([], "done")).toBe(true); // empty operand → keep
  });

  it("is-none-of", () => {
    expect(isNoneOf(["open", "wip"], "done")).toBe(true);
    expect(isNoneOf(["open", "wip"], "open")).toBe(false);
    expect(isNoneOf([], "open")).toBe(true);
  });

  it("is-empty / is-not-empty", () => {
    expect(isEmpty(undefined, null)).toBe(true);
    expect(isEmpty(undefined, "")).toBe(true);
    expect(isEmpty(undefined, "open")).toBe(false);
    expect(isNotEmpty(undefined, "open")).toBe(true);
    expect(isNotEmpty(undefined, undefined)).toBe(false);
  });
});
