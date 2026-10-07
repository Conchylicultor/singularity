import { describe, expect, it } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { appliedReading, inversionReading } from "./reading";

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const t = (token: string) => ChordTokenSchema.parse(token);

describe("inversionReading", () => {
  const cases: [string, string | null][] = [
    ["0:4-3/1", "I/3"],
    ["0:4-3/2", "I/5"],
    ["5:4-3/2", "IV/1"],
    ["7:4-3/1", "V/7"],
    ["7:4-3-3/3", "V7/4"],
    ["7:4-3-3/1", "V7/7"],
    ["2:3-4-3/1", "ii7/4"],
    ["0:3-4/1", "i/♭3"],
    ["10:4-3/1", "♭VII/2"],
    ["5:3-4/1", "iv/♭6"],
    ["0:4-3/0", null],
    ["7:5-2/1", null],
  ];
  for (const [token, reading] of cases) {
    it(`${token} reads ${String(reading)}`, () => {
      expect(inversionReading(t(token))).toBe(reading);
    });
  }
});

describe("appliedReading", () => {
  const major: [string, string | null][] = [
    ["2:4-3/0", "V/V"],
    ["4:4-3/0", "V/vi"],
    ["9:4-3/0", "V/ii"],
    ["11:4-3/0", "V/iii"],
    ["0:4-3-3/0", "V7/IV"],
    ["2:4-3-3/0", "V7/V"],
    ["6:3-3-3/0", "vii°7/V"],
    // Diatonic, on the tonic, or resolving outside the scale.
    ["7:4-3-3/0", null],
    ["5:4-3/0", null],
    ["5:4-3-3/0", null],
    ["10:4-3-3/0", null],
    ["1:4-3-3/0", null],
    // An inversion is read as one.
    ["2:4-3/1", null],
  ];
  for (const [token, reading] of major) {
    it(`in major, ${token} reads ${String(reading)}`, () => {
      expect(appliedReading(t(token), MAJOR)).toBe(reading);
    });
  }

  it("in minor, V and vii°7 resolve to the tonic: no reading", () => {
    expect(appliedReading(t("7:4-3/0"), MINOR)).toBeNull();
    expect(appliedReading(t("11:3-3-3/0"), MINOR)).toBeNull();
    expect(appliedReading(t("2:4-3/0"), MINOR)).toBe("V/v");
  });
});
