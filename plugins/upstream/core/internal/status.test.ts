import { describe, expect, test } from "bun:test";
import { isCouldNotAsk } from "./status";

describe("isCouldNotAsk", () => {
  test("a remote nobody could reach is a state, not a bug", () => {
    expect(isCouldNotAsk("unreachable")).toBe(true);
  });

  test("a remote that never learned who we are is the same fact", () => {
    // It said nothing about whether updates exist, so there is nothing to
    // report and nothing to throw about.
    expect(isCouldNotAsk("no-credentials")).toBe(true);
  });

  test("a refused read stays loud", () => {
    // The remote recognised us and said no: a repo deleted, made private, or a
    // typo'd URL. That does not fix itself, so it must not be filed as weather.
    expect(isCouldNotAsk("denied")).toBe(false);
  });

  test("a failure nothing classified stays loud", () => {
    expect(isCouldNotAsk("unclassified")).toBe(false);
  });
});
