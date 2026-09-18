import { describe, expect, it } from "bun:test";
import { ChordTokenSchema } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordVoicing } from "./voicing";

const voicing = (text: string, tonicPc: number) =>
  chordVoicing(ChordTokenSchema.parse(text), tonicPc);

describe("chordVoicing", () => {
  it("voices root-position triads close, the bass nearest middle C", () => {
    expect(voicing("0:4-3/0", 0)).toEqual([60, 64, 67]); // C E G
    expect(voicing("5:4-3/0", 0)).toEqual([65, 69, 72]); // F A C
    expect(voicing("7:4-3/0", 0)).toEqual([55, 59, 62]); // G B D
    expect(voicing("6:3-3/0", 0)).toEqual([54, 57, 60]); // F♯ A C
  });

  it("transposes into the song's key", () => {
    expect(voicing("5:4-3/0", 7)).toEqual([60, 64, 67]); // IV in G: C E G
    expect(voicing("0:4-3/0", 2)).toEqual([62, 66, 69]); // I in D: D F♯ A
    expect(voicing("11:3-3-3/0", 2)).toEqual([61, 64, 67, 70]); // vii°7 in D
  });

  it("puts the inversion's tone in the bass", () => {
    expect(voicing("0:4-3/1", 0)).toEqual([64, 67, 72]); // I6: E G C
    expect(voicing("0:4-3/2", 0)).toEqual([55, 60, 64]); // I64: G C E
    expect(voicing("7:4-3-3/1", 0)).toEqual([59, 62, 65, 67]); // V65: B D F G
    expect(voicing("7:4-3-3/3", 0)).toEqual([53 + 12, 67, 71, 74]); // V42: F G B D
  });

  it("keeps the bass between F♯3 and F4 for every root", () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      for (let root = 0; root < 12; root++) {
        const [bass] = voicing(`${root}:4-3/0`, tonic);
        expect(bass).toBeGreaterThanOrEqual(54);
        expect(bass).toBeLessThanOrEqual(65);
      }
    }
  });

  it("refuses a tonic that is not a pitch class", () => {
    expect(() => voicing("0:4-3/0", 12)).toThrow("0–11");
    expect(() => voicing("0:4-3/0", 1.5)).toThrow("0–11");
  });
});
