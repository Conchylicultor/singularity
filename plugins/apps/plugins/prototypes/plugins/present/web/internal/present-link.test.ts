import { describe, expect, test } from "bun:test";
import { decodePicks, encodePicks } from "./present-link";

describe("picks segment", () => {
  test("round-trips, separators inside values included", () => {
    const picks = { theme: "dark,blue", "a=b": "x y", screen: "home" };
    expect(decodePicks(encodePicks(picks))).toEqual(picks);
  });
  test("spells plain picks readably", () => {
    expect(encodePicks({ theme: "mist", screen: "home" })).toBe(
      "theme=mist,screen=home",
    );
  });
  test("empty picks is the empty segment", () => {
    expect(decodePicks(encodePicks({}))).toEqual({});
  });
  test("a part without = throws", () => {
    expect(() => decodePicks("theme")).toThrow();
  });
});
