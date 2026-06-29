import { describe, expect, test } from "bun:test";
import { isForeignOverride } from "./config-origin-gen";

describe("isForeignOverride", () => {
  const reorderFields = ["items"];

  test("dead `{ order, hidden }` reorder format → foreign", () => {
    expect(
      isForeignOverride({ order: ["a:foo"], hidden: [] }, reorderFields),
    ).toBe(true);
  });

  test("current `{ items }` reorder override → kept", () => {
    expect(isForeignOverride({ items: ["a:foo", "b:bar"] }, reorderFields)).toBe(false);
  });

  test("partial override carrying at least one field key → kept", () => {
    expect(isForeignOverride({ enabled: true }, ["enabled", "label"])).toBe(false);
  });

  test("empty object makes no claim → not foreign (left for normal handling)", () => {
    expect(isForeignOverride({}, reorderFields)).toBe(false);
  });

  test("absent document → not foreign", () => {
    expect(isForeignOverride(undefined, reorderFields)).toBe(false);
  });

  test("non-object (array / scalar) document → not foreign", () => {
    expect(isForeignOverride(["items"], reorderFields)).toBe(false);
    expect(isForeignOverride("items", reorderFields)).toBe(false);
  });

  test("override sharing one of several fields → kept", () => {
    expect(
      isForeignOverride({ items: [], order: ["x"] }, ["items"]),
    ).toBe(false);
  });
});
