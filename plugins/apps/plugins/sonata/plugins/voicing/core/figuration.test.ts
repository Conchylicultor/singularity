import { describe, expect, it } from "bun:test";
import {
  findFiguration,
  figurationsForHand,
  FIGURATIONS,
  type FigurationContext,
} from "./figuration";

/**
 * Figuration tone-order tests. A figuration is a pure `(ctx) => StruckTone[]`, so
 * every case pins a FIXED context and asserts the struck pitches.
 *
 * The register model is ACTIVE-hand relative: `tone` / `color` degrees resolve
 * against `ctx.tones` (whichever hand the figuration is placed on), while an
 * `{all, reg:"chord"|"bass"}` degree reaches an explicit register
 * (`chordTones` / `bassTones`). So each figuration is driven with the active
 * `tones` its role would see; both-role figures are tested on BOTH registers to
 * prove they adapt.
 *
 * The fixture is a C-maj TRIAD placed in two registers:
 *   BASS  = [36, 40, 43]  (C2, E2, G2)
 *   CHORD = [60, 64, 67]  (C4, E4, G4)
 * A triad has no stacked-third index 3, so a requested `D7` must substitute the
 * OCTAVE ROOT of the ACTIVE register (`tones[0] + 12`) — §5.4.
 */

const BASS = [36, 40, 43];
const CHORD = [60, 64, 67];

const ctx = (over: Partial<FigurationContext> = {}): FigurationContext => ({
  chord: { symbol: "C", root: 0, quality: "maj" },
  tones: [],
  tonesOfNext: [],
  chordTones: CHORD,
  bassTones: BASS,
  onsetIndex: 0,
  positionInChord: 0,
  nextChord: null,
  firstOnsetOfChord: false,
  lastOnsetBeforeChange: false,
  ...over,
});

/** Struck pitches of `id` at each `positionInChord`, driven with active `tones`. */
const cycle = (id: string, tones: number[], positions: number[]): number[][] =>
  positions.map((positionInChord) =>
    findFiguration(id)
      .select(ctx({ tones, positionInChord }))
      .map((s) => s.pitch),
  );

describe("chord-role figurations (active register = chord)", () => {
  it("block strikes the whole active tone-set", () => {
    expect(cycle("block", CHORD, [0])).toEqual([[60, 64, 67]]);
  });

  it("block-triad strikes the lowest three active tones", () => {
    expect(cycle("block-triad", CHORD, [0])).toEqual([[60, 64, 67]]);
  });
});

describe("both-role broken-chord figurations adapt to the active register", () => {
  it("arpeggio-up on the CHORD register — D7 falls back to the chord octave root (72)", () => {
    expect(cycle("arpeggio-up", CHORD, [0, 1, 2, 3])).toEqual([
      [60],
      [64],
      [67],
      [72], // §5.4: index 3 absent → CHORD[0] + 12
    ]);
  });

  it("arpeggio-up on the BASS register — D7 falls back to the bass octave root (48)", () => {
    expect(cycle("arpeggio-up", BASS, [0, 1, 2, 3])).toEqual([
      [36],
      [40],
      [43],
      [48], // §5.4: index 3 absent → BASS[0] + 12 — proves the figure adapts
    ]);
  });

  it("arpeggio-down walks D7,D5,D3,D1 (bass register)", () => {
    expect(cycle("arpeggio-down", BASS, [0, 1, 2, 3])).toEqual([
      [48],
      [43],
      [40],
      [36],
    ]);
  });

  it("broken-updown walks D1,D3,D5,D3 (bass register)", () => {
    expect(cycle("broken-updown", BASS, [0, 1, 2, 3])).toEqual([
      [36],
      [40],
      [43],
      [40],
    ]);
  });

  it("alberti walks D1,D5,D3,D5 → 36,43,40,43 (bass register)", () => {
    expect(cycle("alberti", BASS, [0, 1, 2, 3])).toEqual([
      [36],
      [43],
      [40],
      [43],
    ]);
  });
});

describe("bass-role cyclic figurations (active register = bass)", () => {
  it("root strikes only the low root", () => {
    expect(cycle("root", BASS, [0])).toEqual([[36]]);
  });

  it("octave-bass walks D1,D8 → 36,48", () => {
    expect(cycle("octave-bass", BASS, [0, 1])).toEqual([[36], [48]]);
  });

  it("root-fifth walks D1,D5 → 36,43", () => {
    expect(cycle("root-fifth", BASS, [0, 1])).toEqual([[36], [43]]);
  });

  it("pop-1585 walks D1,D5,D8,D5 → 36,43,48,43", () => {
    expect(cycle("pop-1585", BASS, [0, 1, 2, 3])).toEqual([
      [36],
      [43],
      [48],
      [43],
    ]);
  });

  it("boogie walks D1,D3,D5,D6,Db7,D6,D5,D3 (color tones D6→45, Db7→46)", () => {
    expect(cycle("boogie", BASS, [0, 1, 2, 3, 4, 5, 6, 7])).toEqual([
      [36],
      [40],
      [43],
      [45], // D6 = active root 36 + 9
      [46], // Db7 = active root 36 + 10
      [45],
      [43],
      [40],
    ]);
  });
});

describe("two-register bass figurations (explicit chord-register stabs)", () => {
  it("stride: active-register root/fifth alternates with an explicit chord stab", () => {
    expect(cycle("stride", BASS, [0, 1, 2, 3])).toEqual([
      [36], // D1 (active / bass register)
      [60, 64, 67], // {all, reg:"chord"} — reaches chordTones explicitly
      [43], // D5 (active / bass register)
      [60, 64, 67],
    ]);
  });

  it("waltz strikes active root then two explicit chord stabs", () => {
    expect(cycle("waltz", BASS, [0, 1, 2])).toEqual([
      [36],
      [60, 64, 67],
      [60, 64, 67],
    ]);
  });

  it("oom-pah alternates active root/fifth with explicit chord stabs", () => {
    expect(cycle("oom-pah", BASS, [0, 1, 2, 3])).toEqual([
      [36],
      [60, 64, 67],
      [43],
      [60, 64, 67],
    ]);
  });
});

describe("generative figurations", () => {
  it("harp-roll spreads the active tones over two octaves, sorted ascending", () => {
    const struck = findFiguration("harp-roll").select(ctx({ tones: CHORD }));
    expect(struck.map((s) => s.pitch)).toEqual([60, 64, 67, 72, 76, 79]);
    // Each tone gets its own within-onset id index.
    expect(struck.map((s) => s.k)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("walking plays the active root on the first onset of the chord", () => {
    const struck = findFiguration("walking").select(
      ctx({ tones: BASS, firstOnsetOfChord: true, positionInChord: 0 }),
    );
    expect(struck.map((s) => s.pitch)).toEqual([36]);
  });

  it("walking plays a chromatic-below approach on the last onset before a change", () => {
    // Active next-chord root is 43 → approach a half-step below = 42.
    const struck = findFiguration("walking").select(
      ctx({
        tones: BASS,
        firstOnsetOfChord: false,
        lastOnsetBeforeChange: true,
        tonesOfNext: [43],
        positionInChord: 1,
      }),
    );
    expect(struck.map((s) => s.pitch)).toEqual([42]);
  });

  it("walking cycles 5th/3rd/root between the anchor and the approach", () => {
    // Not first, not last-before-change → cycle [5th, 3rd, root] = [43, 40, 36].
    const mid = (positionInChord: number) =>
      findFiguration("walking")
        .select(ctx({ tones: BASS, positionInChord }))
        .map((s) => s.pitch);
    expect([mid(0), mid(1), mid(2)]).toEqual([[43], [40], [36]]);
  });
});

describe("generic collection API", () => {
  it("findFiguration throws loudly on an unknown id", () => {
    expect(() => findFiguration("nope")).toThrow(
      "[voicing] unknown figuration: nope",
    );
  });

  it("figurationsForHand returns hand-specific plus both-role figurations", () => {
    const bassIds = figurationsForHand("bass").map((f) => f.id);
    const chordIds = figurationsForHand("chord").map((f) => f.id);

    // Both-role arpeggios appear in BOTH hands' pickers.
    expect(bassIds).toContain("alberti");
    expect(chordIds).toContain("alberti");
    // Hand-specific figures appear only in their own picker.
    expect(bassIds).toContain("walking");
    expect(chordIds).not.toContain("walking");
    expect(chordIds).toContain("block");
    expect(bassIds).not.toContain("block");
  });

  it("every figuration is reachable by its own id", () => {
    for (const f of FIGURATIONS) expect(findFiguration(f.id)).toBe(f);
  });
});
