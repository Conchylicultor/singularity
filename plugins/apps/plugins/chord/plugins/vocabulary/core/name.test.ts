import { describe, expect, it } from "bun:test";
import {
  chordTokenFromParts,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { CHORD_TEMPLATES } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { chordLabel } from "./label";
import { songVocabulary } from "./name";
import type { SongKey } from "./key";

const chord = (
  root: number,
  intervals: readonly number[],
  inversion = 0,
): ChordToken => chordTokenFromParts({ root, intervals, inversion });

const MAJ = [4, 3];
const MIN = [3, 4];
const DIM = [3, 3];
const DOM7 = [4, 3, 3];

const G: SongKey = { tonic: "G", mode: "major" };
const E_FLAT: SongKey = { tonic: "Eb", mode: "major" };
const C_MINOR: SongKey = { tonic: "C", mode: "minor" };
const C: SongKey = { tonic: "C", mode: "major" };

describe("nameChord — a chord's letter name in the song's key", () => {
  const { nameChord } = songVocabulary(G);
  const cases: [string, ChordToken, string][] = [
    ["I", chord(0, MAJ), "G"],
    ["IV", chord(5, MAJ), "C"],
    ["V", chord(7, MAJ), "D"],
    ["V7", chord(7, DOM7), "D7"],
    ["vi", chord(9, MIN), "Em"],
    ["vii°", chord(11, DIM), "F♯dim"],
    ["V6", chord(7, MAJ, 1), "D/F♯"],
    ["I64", chord(0, MAJ, 2), "G/D"],
  ];
  for (const [numeral, token, name] of cases) {
    it(`${numeral} in G is ${name}`, () => {
      expect(nameChord(token)).toBe(name);
    });
  }

  it("spells the root through the key: IV in E♭ is A♭, not G♯", () => {
    expect(songVocabulary(E_FLAT).nameChord(chord(5, MAJ))).toBe("A♭");
  });

  it("names a borrowed chord through the song's signature: ♭VII in C minor is B♭", () => {
    expect(songVocabulary(C_MINOR).nameChord(chord(10, MAJ))).toBe("B♭");
  });
});

describe("nameChord — stacks outside Sonata's table", () => {
  const { nameChord } = songVocabulary(C);

  it("spells each tone above the root, the way the numeral does", () => {
    expect(nameChord(chord(0, [4, 3, 7]))).toBe("C(3,5,9)");
    expect(nameChord(chord(0, [7]))).toBe("C(5)");
  });

  it("names a lone root", () => {
    expect(nameChord(chord(0, []))).toBe("C(1)");
  });

  it("names the bass of an inverted one", () => {
    expect(nameChord(chord(0, [4, 3, 7], 1))).toBe("C(3,5,9)/E");
  });
});

describe("noteName", () => {
  it("spells a pitch the way the key does", () => {
    expect(songVocabulary(E_FLAT).noteName(8)).toBe("A♭");
    expect(songVocabulary({ tonic: "E", mode: "major" }).noteName(6)).toBe(
      "F♯",
    );
  });

  it("leans with the key for a non-diatonic pitch: A harmonic minor's 7th is G♯", () => {
    expect(
      songVocabulary({ tonic: "A", mode: "harmonicMinor" }).noteName(8),
    ).toBe("G♯");
  });

  it("gives no octave number", () => {
    const { noteName } = songVocabulary(C);
    expect(noteName(60)).toBe("C");
    expect(noteName(72)).toBe("C");
  });
});

describe("nameChord — the name and the numeral read the same chord", () => {
  it("carries a slash bass exactly when the numeral reports an inversion", () => {
    const { nameChord, noteName } = songVocabulary(G);
    const tonicPc = 7;
    for (const template of CHORD_TEMPLATES) {
      const intervals = template.intervals.map(
        (above, i) => above - (template.intervals[i - 1] ?? 0),
      );
      for (let root = 0; root < 12; root++) {
        const rootPosition = nameChord(chord(root, intervals));
        for (
          let inversion = 0;
          inversion <= intervals.length;
          inversion++ // one past the top: the top tone goes in the bass
        ) {
          const token = chord(root, intervals, inversion);
          const inverted = chordLabel(token).figure !== "";
          const bassTone =
            template.intervals[
              Math.min(inversion, template.intervals.length) - 1
            ] ?? 0;
          expect(nameChord(token)).toBe(
            inverted
              ? `${rootPosition}/${noteName(tonicPc + root + bassTone)}`
              : rootPosition,
          );
        }
      }
    }
  });
});
