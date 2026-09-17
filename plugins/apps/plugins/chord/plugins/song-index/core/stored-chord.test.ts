import { describe, expect, it } from "bun:test";
import type { IndexedChord } from "./indexed-chord";
import { StoredChordSchema, compactChord, expandChord } from "./stored-chord";
import { chord, rest } from "./test-sections";
import { chordToken } from "./token";

const KEY = { beat: 1, tonic: "C", scale: "major" as const };
const TOKEN = chordToken({ rootPc: 7, intervals: [4, 3, 3], inversion: 1 }, 0);

function sounding(c: ReturnType<typeof chord>): IndexedChord {
  return {
    chord: c,
    key: KEY,
    reading: { kind: "sound", token: TOKEN, features: [] },
  };
}

describe("stored chord", () => {
  it("drops default fields and restores them on read", () => {
    const plain = chord(1, 4, { root: 5 });
    const stored = compactChord(sounding(plain));
    expect(stored).toEqual({
      beat: 1,
      duration: 4,
      root: 5,
      type: 5,
      token: TOKEN,
    });
    expect(expandChord(stored)).toEqual({ ...plain, token: TOKEN });
  });

  it("round-trips every spelling field through JSON", () => {
    const spelled = chord(3.5, 1.5, {
      root: 2,
      type: 7,
      inversion: 1,
      applied: 5,
      adds: [9],
      omits: [3],
      alterations: ["b9"],
      suspensions: [4],
      borrowed: [0, 2, 4, 5, 8, 9, 11],
      alternate: "_",
    });
    const stored = StoredChordSchema.parse(
      JSON.parse(JSON.stringify(compactChord(sounding(spelled)))),
    );
    expect(expandChord(stored)).toEqual({ ...spelled, token: TOKEN });
  });

  it("keeps an empty-string borrowed apart from null", () => {
    const stored = compactChord(sounding(chord(1, 1, { borrowed: "" })));
    expect(expandChord(stored).borrowed).toBe("");
    expect(
      expandChord(compactChord(sounding(chord(1, 1)))).borrowed,
    ).toBeNull();
  });

  it("stores a rest with no token", () => {
    const r = rest(5, 2);
    const stored = compactChord({
      chord: r,
      key: KEY,
      reading: { kind: "rest" },
    });
    expect(stored.token).toBeUndefined();
    expect(expandChord(stored)).toEqual({ ...r, token: null });
  });
});
