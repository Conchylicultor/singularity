import { describe, expect, test } from "bun:test";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  withBlanks,
  withChordChanges,
  withChordState,
  withExtras,
} from "./change";
import {
  canonicalSelection,
  chordState,
  firstSelection,
  practisedChords,
  sameSelection,
} from "./selection";

const I = "0:4-3/0" as ChordToken;
const IV = "5:4-3/0" as ChordToken;
const V = "7:4-3/0" as ChordToken;
const vi = "9:3-4/0" as ChordToken;
const ii = "2:3-4/0" as ChordToken;

describe("firstSelection", () => {
  test("everyone starts on I, IV and V practised, the last half blank, no other chord", () => {
    const first = firstSelection();
    expect(practisedChords(first).sort()).toEqual([I, IV, V].sort());
    expect(first.blanks).toBe("half");
    expect(first.extras).toBe(0);
  });
});

describe("the writes", () => {
  test("one chord moves between practise, hear and off", () => {
    const heard = withChordState(firstSelection(), I, "hear");
    expect(chordState(heard, I)).toBe("hear");
    expect(chordState(withChordState(heard, I, "off"), I)).toBe("off");
    expect(chordState(withChordState(heard, vi, "practice"), vi)).toBe(
      "practice",
    );
  });

  test("a batch of changes applies in order: a section, then one chord of it back", () => {
    const next = withChordChanges(firstSelection(), [
      { token: vi, state: "hear" },
      { token: ii, state: "hear" },
      { token: vi, state: "practice" },
    ]);
    expect(chordState(next, vi)).toBe("practice");
    expect(chordState(next, ii)).toBe("hear");
    expect(chordState(next, I)).toBe("practice");
  });

  test("Clear then Undo: every chord off, then the snapshot replayed, is the same selection", () => {
    const before = withChordState(firstSelection(), vi, "hear");
    const cleared = withChordChanges(
      before,
      before.chords.map((c) => ({ token: c.token, state: "off" as const })),
    );
    expect(cleared.chords).toEqual([]);
    const undone = withChordChanges(
      cleared,
      before.chords.map((c) => ({ token: c.token, state: c.state })),
    );
    expect(sameSelection(undone, before)).toBe(true);
  });

  test("blanks and extras", () => {
    expect(withBlanks(firstSelection(), "random").blanks).toBe("random");
    expect(withExtras(firstSelection(), "any").extras).toBe("any");
    expect(withExtras(firstSelection(), 2).extras).toBe(2);
  });

  test("the canonical form sorts the chords, so order never makes two selections differ", () => {
    const a = canonicalSelection({
      chords: [
        { token: V, state: "practice" },
        { token: I, state: "hear" },
      ],
      blanks: "all",
      extras: 1,
    });
    expect(a.chords.map((c) => c.token)).toEqual([I, V]);
  });
});
