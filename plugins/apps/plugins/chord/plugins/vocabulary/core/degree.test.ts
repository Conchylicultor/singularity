import { describe, expect, it } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  chordDegree,
  chordFunction,
  chordShortcutKey,
  type ChordFunction,
} from "./degree";

const token = (text: string) => ChordTokenSchema.parse(text);

describe("chord degree, function and key", () => {
  const cases: [string, number, ChordFunction, string][] = [
    ["0:4-3/0", 0, "tonic", "1"],
    ["2:3-4/0", 1, "subdominant", "2"],
    ["4:3-4/0", 2, "tonic", "3"],
    ["5:4-3/1", 3, "subdominant", "4"],
    ["7:4-3-3/0", 4, "dominant", "5"],
    ["9:3-4/0", 5, "tonic", "6"],
    ["11:3-3/0", 6, "dominant", "7"],
  ];
  for (const [text, degree, fn, key] of cases) {
    it(`${text}: degree ${degree}, ${fn}, key ${key}`, () => {
      expect(chordDegree(token(text))).toBe(degree);
      expect(chordFunction(token(text))).toBe(fn);
      expect(chordShortcutKey(token(text))).toBe(key);
    });
  }

  it("has none for a root outside the major scale", () => {
    for (const text of [
      "10:4-3/0",
      "3:4-3/0",
      "1:4-3/0",
      "6:3-3/0",
      "8:4-3/0",
    ]) {
      expect(chordDegree(token(text))).toBeNull();
      expect(chordFunction(token(text))).toBeNull();
      expect(chordShortcutKey(token(text))).toBeNull();
    }
  });
});
