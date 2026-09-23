import { describe, expect, test } from "bun:test";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { withBlanks, withChapterState, withChordState } from "./change";
import { firstSelection } from "./path";
import { chordState } from "./selection";

const I = "0:4-3/0" as ChordToken;
const vi = "9:3-4/0" as ChordToken;
const i = "0:3-4/0" as ChordToken;

describe("the writes", () => {
  test("one chord moves between practise, hear and off", () => {
    const heard = withChordState(firstSelection(), I, "hear");
    expect(chordState(heard, I)).toBe("hear");
    expect(chordState(withChordState(heard, I, "off"), I)).toBe("off");
    expect(chordState(withChordState(heard, vi, "practice"), vi)).toBe(
      "practice",
    );
  });

  test("a chapter sets all its chords and opens its key modes", () => {
    const change = withChapterState(firstSelection(), "minor", "hear");
    if (!change.ok) throw new Error(change.reason);
    expect(chordState(change.selection, i)).toBe("hear");
    expect(change.selection.modes).toContain("minor");
  });

  test("turning the only chapter with a key mode off is refused", () => {
    const change = withChapterState(firstSelection(), "major", "off");
    expect(change.ok).toBe(false);
  });

  test("blanks", () => {
    expect(withBlanks(firstSelection(), "one").blanks).toBe("one");
  });
});
