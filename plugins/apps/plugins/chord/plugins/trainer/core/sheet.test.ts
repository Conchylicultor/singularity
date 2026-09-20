import { describe, expect, it } from "bun:test";
import {
  chordTokenFromParts,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { Round } from "./round";
import {
  clearBackward,
  emptySheet,
  fillSelected,
  moveSelection,
  recordRoundBody,
  selectBox,
  sheetScore,
} from "./sheet";

const major = (root: number): ChordToken =>
  chordTokenFromParts({ root, intervals: [4, 3], inversion: 0 });
const I = major(0);
const IV = major(5);
const V = major(7);

/** A four-box round, one chord per bar of a 4/4 loop: I IV V I. */
function round(tokens: readonly ChordToken[] = [I, IV, V, I]): Round {
  return {
    sectionId: "abc_123",
    videoId: "X1Fqn9du7xo",
    shape: "bars-4",
    startBeat: 1,
    keyTonicPc: 0,
    grid: { beats: tokens.length * 4, beatsPerBar: 4 },
    loop: { startSec: 0, endSec: tokens.length * 4 },
    boxes: tokens.map((token, i) => ({
      position: i,
      token,
      startBeat: 1 + i * 4,
      endBeat: 5 + i * 4,
      gridStart: i * 4,
      gridSpan: 4,
      startSec: i * 4,
      endSec: (i + 1) * 4,
    })),
  };
}

const ALL = [0, 1, 2, 3];

describe("emptySheet", () => {
  it("fills the given boxes in and selects the first asked one", () => {
    const sheet = emptySheet(round(), [2]);
    expect(sheet.answers).toEqual([I, IV, null, I]);
    expect(sheet.asked).toEqual([false, false, true, false]);
    expect(sheet.selected).toBe(2);
    expect(sheet.checked).toBe(false);
    // A given box was never answered, so it has no time.
    expect(sheet.answerMs).toEqual([null, null, null, null]);
  });

  it("leaves every box empty when the whole loop is asked", () => {
    const sheet = emptySheet(round(), ALL);
    expect(sheet.answers).toEqual([null, null, null, null]);
    expect(sheet.selected).toBe(0);
  });

  it("refuses a round nobody is asked to answer", () => {
    expect(() => emptySheet(round(), [])).toThrow(/at least one box/);
  });

  it("refuses a box the round does not have, or one asked twice", () => {
    expect(() => emptySheet(round(), [4])).toThrow(/does not exist/);
    expect(() => emptySheet(round(), [-1])).toThrow(/does not exist/);
    expect(() => emptySheet(round(), [1, 1])).toThrow(/twice/);
  });
});

describe("a round with one asked box", () => {
  it("is checked by that one fill, and scores only it", () => {
    const r = round();
    const sheet = fillSelected(emptySheet(r, [2]), V, 1_400);
    expect(sheet.checked).toBe(true);
    expect(sheet.selected).toBeNull();
    expect(sheetScore(sheet, r)).toEqual({
      right: 1,
      total: 1,
      totalMs: 1_400,
    });
  });

  it("records only the asked box, and says how many were given", () => {
    const r = round();
    const sheet = fillSelected(emptySheet(r, [2]), IV, 900);
    expect(recordRoundBody(sheet, r)).toEqual({
      sectionId: "abc_123",
      videoId: "X1Fqn9du7xo",
      shape: "bars-4",
      startBeat: 1,
      answers: [{ position: 2, token: V, answer: IV, answerMs: 900 }],
      givenCount: 3,
    });
  });
});

describe("a given box is out of reach", () => {
  const r = round();

  it("cannot be selected by a click", () => {
    const sheet = emptySheet(r, [1, 3]);
    expect(selectBox(sheet, 0)).toBe(sheet);
    expect(selectBox(sheet, 3).selected).toBe(3);
    expect(() => selectBox(sheet, 9)).toThrow(/does not exist/);
  });

  it("is stepped over by the arrows, which stop at the last asked box", () => {
    const sheet = emptySheet(r, [1, 3]);
    expect(sheet.selected).toBe(1);
    expect(moveSelection(sheet, 1).selected).toBe(3);
    // Nothing asked past 3: the selection stays put.
    expect(moveSelection(moveSelection(sheet, 1), 1).selected).toBe(3);
    expect(moveSelection(sheet, -1)).toBe(sheet);
  });

  it("is never cleared by Backspace, which reaches the asked box before it", () => {
    const filled = fillSelected(emptySheet(r, [1, 3]), IV, 1_000);
    expect(filled.selected).toBe(3);
    // Box 3 is empty, so Backspace goes back over the given box 2 to box 1.
    const cleared = clearBackward(filled);
    expect(cleared.selected).toBe(1);
    expect(cleared.answers).toEqual([I, null, V, null]);
    // The given boxes still hold their chords.
    expect(cleared.asked).toEqual([false, true, false, true]);
  });

  it("is not refilled by a fill: the selection only ever lands on asked boxes", () => {
    let sheet = emptySheet(r, [0, 3]);
    sheet = fillSelected(sheet, I, 800);
    expect(sheet.selected).toBe(3);
    sheet = fillSelected(sheet, V, 800);
    expect(sheet.checked).toBe(true);
    expect(sheet.answers).toEqual([I, IV, V, V]);
    expect(sheetScore(sheet, r)).toEqual({
      right: 1,
      total: 2,
      totalMs: 1_600,
    });
  });
});

describe("a round asking for every box", () => {
  const r = round();

  it("walks forward and checks on the last fill", () => {
    let sheet = emptySheet(r, ALL);
    for (const [i, token] of [I, IV, V, I].entries()) {
      expect(sheet.selected).toBe(i);
      sheet = fillSelected(sheet, token, 1_000);
    }
    expect(sheet.checked).toBe(true);
    expect(sheetScore(sheet, r)).toEqual({
      right: 4,
      total: 4,
      totalMs: 4_000,
    });
    expect(recordRoundBody(sheet, r).answers).toHaveLength(4);
    expect(recordRoundBody(sheet, r).givenCount).toBe(0);
  });

  it("refuses to record a sheet that is not checked", () => {
    expect(() => recordRoundBody(emptySheet(r, ALL), r)).toThrow(
      /not checked yet/,
    );
  });

  it("changes nothing once checked", () => {
    let sheet = emptySheet(r, ALL);
    for (const token of [I, IV, V, I])
      sheet = fillSelected(sheet, token, 1_000);
    expect(fillSelected(sheet, V, 1_000)).toBe(sheet);
    expect(clearBackward(sheet)).toBe(sheet);
    expect(moveSelection(sheet, -1)).toBe(sheet);
    expect(selectBox(sheet, 0)).toBe(sheet);
  });
});
