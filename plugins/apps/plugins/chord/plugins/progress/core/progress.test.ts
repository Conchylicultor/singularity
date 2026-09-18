import { describe, expect, test } from "bun:test";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { decodeProgressParams, encodeProgressParams } from "./progress";

const I = "0:4-3/0" as ChordToken;
const IV = "5:4-3/0" as ChordToken;
const V = "7:4-3/0" as ChordToken;
const bVII = "10:4-3/0" as ChordToken;

describe("encodeProgressParams", () => {
  test("sorts and deduplicates, so one set is one spelling", () => {
    const a = encodeProgressParams({
      timeZone: "Europe/Paris",
      tokens: [V, I, IV, I],
    });
    const b = encodeProgressParams({
      timeZone: "Europe/Paris",
      tokens: [IV, V, I],
    });
    expect(a).toEqual({
      timeZone: "Europe/Paris",
      tokens: "0:4-3/0,5:4-3/0,7:4-3/0",
    });
    expect(b).toEqual(a);
  });

  test("the order is plain string order (10 before 5)", () => {
    expect(
      encodeProgressParams({ timeZone: "UTC", tokens: [V, bVII] }).tokens,
    ).toBe("10:4-3/0,7:4-3/0");
  });

  test("the empty set is the empty string", () => {
    expect(encodeProgressParams({ timeZone: "UTC", tokens: [] }).tokens).toBe(
      "",
    );
  });

  test("an unknown time zone throws", () => {
    expect(() =>
      encodeProgressParams({ timeZone: "Mars/Olympus", tokens: [I] }),
    ).toThrow(/not a time zone/);
  });
});

describe("decodeProgressParams", () => {
  test("round-trips what encode produced", () => {
    const decoded = { timeZone: "America/New_York", tokens: [I, IV, V] };
    expect(decodeProgressParams(encodeProgressParams(decoded))).toEqual(
      decoded,
    );
    expect(
      decodeProgressParams(
        encodeProgressParams({ timeZone: "UTC", tokens: [] }),
      ),
    ).toEqual({ timeZone: "UTC", tokens: [] });
  });

  test("refuses a set not in canonical form", () => {
    expect(() =>
      decodeProgressParams({ timeZone: "UTC", tokens: "7:4-3/0,0:4-3/0" }),
    ).toThrow(/canonical/);
    expect(() =>
      decodeProgressParams({ timeZone: "UTC", tokens: "0:4-3/0,0:4-3/0" }),
    ).toThrow(/canonical/);
  });

  test("refuses a string that is not a chord token", () => {
    expect(() =>
      decodeProgressParams({ timeZone: "UTC", tokens: "0:4-3/0,IV" }),
    ).toThrow(/"IV" is not a chord token/);
    expect(() =>
      decodeProgressParams({ timeZone: "UTC", tokens: "0:4-3/0," }),
    ).toThrow(/is not a chord token/);
  });

  test("refuses an unknown time zone", () => {
    expect(() =>
      decodeProgressParams({ timeZone: "Nowhere/Land", tokens: "" }),
    ).toThrow(/not a time zone/);
  });
});
