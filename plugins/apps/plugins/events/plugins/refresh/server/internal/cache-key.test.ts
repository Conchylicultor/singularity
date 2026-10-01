import { describe, expect, test } from "bun:test";
import { extractionCacheKey } from "./cache-key";

describe("extractionCacheKey", () => {
  test("a config change moves the key even when the material did not", () => {
    const before = extractionCacheKey({ days: ["Lundi"] }, "abc");
    const after = extractionCacheKey({ days: ["Mardi"] }, "abc");
    expect(before).not.toBe(after);
  });

  test("a material change moves the key under the same config", () => {
    expect(extractionCacheKey({}, "abc")).not.toBe(
      extractionCacheKey({}, "abd"),
    );
  });

  test("key order in the config does not matter", () => {
    expect(extractionCacheKey({ a: 1, b: { c: 2, d: 3 } }, "x")).toBe(
      extractionCacheKey({ b: { d: 3, c: 2 }, a: 1 }, "x"),
    );
  });

  test("a source that cannot fingerprint always extracts", () => {
    expect(extractionCacheKey({ a: 1 }, null)).toBeNull();
  });
});
