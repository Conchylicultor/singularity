import { describe, expect, test } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { askedPositions, type AskedBox } from "./ask";

const token = (text: string) => ChordTokenSchema.parse(text);
const I = token("0:4-3/0");
const IV = token("5:4-3/0");
const V = token("7:4-3/0");
const vi = token("9:3-4/0");

/** A 16-beat loop: I, IV, V, I, one chord per bar. */
const LOOP: AskedBox[] = [
  { position: 0, token: I, gridStart: 0 },
  { position: 1, token: IV, gridStart: 4 },
  { position: 2, token: V, gridStart: 8 },
  { position: 3, token: I, gridStart: 12 },
];

const asked = (
  boxes: AskedBox[],
  over: Partial<Parameters<typeof askedPositions>[1]> = {},
) =>
  askedPositions(boxes, {
    windowBeats: 16,
    blanks: "all",
    practised: new Set([I, IV, V]),
    target: V,
    ...over,
  });

describe("askedPositions", () => {
  test("all: every box of a practised chord", () => {
    expect(asked(LOOP)).toEqual([0, 1, 2, 3]);
  });

  test("a chord only heard is always given, whatever the blanks", () => {
    const practised = new Set([IV, V]);
    expect(asked(LOOP, { practised })).toEqual([1, 2]);
    expect(asked(LOOP, { practised, blanks: "half" })).toEqual([2]);
  });

  test("half: the practised boxes starting in the second half", () => {
    expect(asked(LOOP, { blanks: "half" })).toEqual([2, 3]);
  });

  test("one: the target's last box, alone", () => {
    expect(asked(LOOP, { blanks: "one", target: I })).toEqual([3]);
    expect(asked(LOOP, { blanks: "one", target: IV })).toEqual([1]);
  });

  test("never empty: half with nothing practised in the second half asks the last practised box", () => {
    expect(
      asked(LOOP, { blanks: "half", practised: new Set([IV]), target: IV }),
    ).toEqual([1]);
  });

  test("a target that is not practised, or a round with no practised chord, throws", () => {
    expect(() => asked(LOOP, { target: vi })).toThrow(/not a practised chord/);
    expect(() => asked(LOOP, { practised: new Set([vi]), target: vi })).toThrow(
      /no practised chord/,
    );
  });

  test("a window of no beats throws", () => {
    expect(() => asked(LOOP, { windowBeats: 0 })).toThrow(/positive number/);
  });
});
