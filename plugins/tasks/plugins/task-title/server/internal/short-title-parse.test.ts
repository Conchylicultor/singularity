import { describe, expect, test } from "bun:test";
import { alreadyShort, parseShortTitle } from "./short-title-parse";

describe("alreadyShort", () => {
  test("a title of three words or fewer is its own short title", () => {
    expect(alreadyShort("Fix login")).toBe("Fix login");
    expect(alreadyShort("  Fix   the  login ")).toBe("Fix the login");
  });

  test("a longer title needs shortening", () => {
    expect(alreadyShort("Fix the login page")).toBeUndefined();
  });

  test("an empty title has no short title", () => {
    expect(alreadyShort("   ")).toBeUndefined();
  });
});

describe("parseShortTitle", () => {
  test("accepts a plain answer", () => {
    expect(parseShortTitle("Login redirect fix")).toEqual({
      ok: true,
      shortTitle: "Login redirect fix",
    });
  });

  test("strips wrapping quotes, a trailing period and whitespace", () => {
    expect(parseShortTitle('  "Login fix."  \n')).toEqual({
      ok: true,
      shortTitle: "Login fix",
    });
    expect(parseShortTitle("“Sidebar  width”")).toEqual({
      ok: true,
      shortTitle: "Sidebar width",
    });
    expect(parseShortTitle("`Queue pins`")).toEqual({
      ok: true,
      shortTitle: "Queue pins",
    });
  });

  test("reads the first non-empty line only", () => {
    expect(parseShortTitle("\n\nTheme flash\nExplanation: …")).toEqual({
      ok: true,
      shortTitle: "Theme flash",
    });
  });

  test("rejects more than three words", () => {
    expect(parseShortTitle("Fix the login page").ok).toBe(false);
  });

  test("rejects an empty answer", () => {
    expect(parseShortTitle("").ok).toBe(false);
    expect(parseShortTitle(' \n "" \n').ok).toBe(false);
  });

  test("rejects an over-long token", () => {
    expect(parseShortTitle("a".repeat(41)).ok).toBe(false);
  });
});
