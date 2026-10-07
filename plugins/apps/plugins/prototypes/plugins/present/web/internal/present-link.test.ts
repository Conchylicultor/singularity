import { describe, expect, test } from "bun:test";
import {
  decodePicks,
  decodeSize,
  encodePicks,
  encodeSize,
} from "./present-link";

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
  test("a color pick's # is escaped, so it never starts a url fragment", () => {
    const picks = { accent: "#3b82f6", screen: "home" };
    const segment = encodePicks(picks);
    expect(segment).toBe("accent=%233b82f6,screen=home");
    expect(decodePicks(segment)).toEqual(picks);
  });
  test("empty picks is the empty segment", () => {
    expect(decodePicks(encodePicks({}))).toEqual({});
  });
  test("a part without = throws", () => {
    expect(() => decodePicks("theme")).toThrow();
  });
});

describe("size segment", () => {
  test("no size is the declared one", () => {
    expect(encodeSize(undefined)).toBe("declared");
    expect(decodeSize("declared")).toBeUndefined();
  });
  test("round-trips every kind of size", () => {
    for (const size of [
      { kind: "responsive" },
      { kind: "window" },
      { kind: "preset", preset: "Phone" },
    ] as const) {
      expect(decodeSize(encodeSize(size))).toEqual(size);
    }
  });
  test("a word that is not a size throws", () => {
    expect(() => decodeSize("huge")).toThrow();
    expect(() => decodeSize("")).toThrow();
  });
});
