import { describe, expect, test } from "bun:test";
import { COMMIT_SHA_RE } from "./pattern";

describe("COMMIT_SHA_RE", () => {
  test("real shas match at both bounds", () => {
    // 7 chars — git's minimum `%h` abbreviation.
    expect(COMMIT_SHA_RE.test("862de5c")).toBe(true);
    // 9 chars — the abbreviation length this repo's git prints today.
    expect(COMMIT_SHA_RE.test("862de5c72")).toBe(true);
    // 40 chars — a full SHA-1.
    expect(COMMIT_SHA_RE.test("862de5c72a1f4b0e9c3d5a7b8e2f6c4d0a9b1e37")).toBe(
      true,
    );
  });

  test("all-digit tokens are rejected at every length", () => {
    // The `(?=.*[a-f])` lookahead: a request id / port / count is not a lookup.
    expect(COMMIT_SHA_RE.test("1786055")).toBe(false);
    expect(COMMIT_SHA_RE.test("1786055151")).toBe(false);
    expect(COMMIT_SHA_RE.test("0".repeat(40))).toBe(false);
  });

  test("lengths outside 7..40 are rejected", () => {
    expect(COMMIT_SHA_RE.test("862de5")).toBe(false); // 6
    expect(
      COMMIT_SHA_RE.test("862de5c72a1f4b0e9c3d5a7b8e2f6c4d0a9b1e370"),
    ).toBe(false); // 41
  });

  test("uppercase hex is rejected", () => {
    expect(COMMIT_SHA_RE.test("862DE5C72")).toBe(false);
    expect(COMMIT_SHA_RE.test("862de5C72")).toBe(false);
  });

  test("non-hex letters are rejected", () => {
    expect(COMMIT_SHA_RE.test("862de5g72")).toBe(false);
    expect(COMMIT_SHA_RE.test("zzzzzzz")).toBe(false);
  });

  test("anchors — a sha with surrounding text does not match", () => {
    expect(COMMIT_SHA_RE.test("commit 862de5c72")).toBe(false);
    expect(COMMIT_SHA_RE.test("862de5c72 ")).toBe(false);
    expect(COMMIT_SHA_RE.test("862de5c72\n")).toBe(false);
  });
});
