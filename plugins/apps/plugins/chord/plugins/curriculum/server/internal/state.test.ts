import { describe, expect, test } from "bun:test";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { selectionOfRow } from "./state";

const I = "0:4-3/0" as ChordToken;
const V = "7:4-3/0" as ChordToken;

describe("selectionOfRow", () => {
  test("a stored `one` (the path's single box) reads as `half`", () => {
    expect(
      selectionOfRow({
        chords: [{ token: I, state: "practice" }],
        blanks: "one",
        extras: 0,
      }).blanks,
    ).toBe("half");
  });

  test("any settable value reads back as stored, the chords in token order", () => {
    expect(
      selectionOfRow({
        chords: [
          { token: V, state: "hear" },
          { token: I, state: "practice" },
        ],
        blanks: "random",
        extras: "any",
      }),
    ).toEqual({
      chords: [
        { token: I, state: "practice" },
        { token: V, state: "hear" },
      ],
      blanks: "random",
      extras: "any",
    });
  });
});
