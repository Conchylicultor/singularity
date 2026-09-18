import { describe, expect, it } from "bun:test";
import { chordLabel } from "./label";
import { STARTING_CHORDS, STARTING_MODES } from "./starting";

describe("the starting set", () => {
  it("is I, IV and V in root position, in major keys", () => {
    expect(STARTING_CHORDS.map(String)).toEqual([
      "0:4-3/0",
      "5:4-3/0",
      "7:4-3/0",
    ]);
    expect(STARTING_CHORDS.map((t) => chordLabel(t).text)).toEqual([
      "I",
      "IV",
      "V",
    ]);
    expect([...STARTING_MODES]).toEqual(["major"]);
  });
});
