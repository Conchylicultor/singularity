import { describe, expect, it } from "bun:test";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  MASTERED_SHARE,
  NEW_SHARE,
  desiredShare,
  loopShareKeys,
  observedShares,
  pickNext,
  shareDeficits,
  type DesiredShares,
  type ShareKey,
} from "./loop-share";

const t = (text: string) => text as ChordToken;
const I = t("0:4-3/0");
const IV = t("5:4-3/0");
const V = t("7:4-3/0");
const vi = t("9:3-4/0");
const odd = t("1:1-1/0");

/** A seeded uniform draw in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const loop = (...chordTokens: ChordToken[]) => ({ window: { chordTokens } });

describe("desiredShare", () => {
  it("is high while a chord is new, low once mastered, never 0", () => {
    expect(desiredShare(null)).toBe(NEW_SHARE);
    expect(desiredShare({ answers: 0, accuracy: null, mastered: false })).toBe(
      NEW_SHARE,
    );
    expect(desiredShare({ answers: 20, accuracy: 1, mastered: true })).toBe(
      MASTERED_SHARE,
    );
    // 20 answers, all right, but slow: as low as a mastered chord, not lower.
    expect(
      desiredShare({ answers: 20, accuracy: 1, mastered: false }),
    ).toBeCloseTo(MASTERED_SHARE, 10);
  });

  it("falls with answers × accuracy", () => {
    const half = desiredShare({ answers: 10, accuracy: 1, mastered: false });
    expect(half).toBeCloseTo((NEW_SHARE + MASTERED_SHARE) / 2, 10);
    const struggling = desiredShare({
      answers: 20,
      accuracy: 0.2,
      mastered: false,
    });
    expect(struggling).toBeGreaterThan(half);
    expect(struggling).toBeLessThan(NEW_SHARE);
  });
});

describe("loopShareKeys", () => {
  const desired: DesiredShares = {
    byChord: new Map([
      [I, 0.15],
      [vi, 0.5],
    ]),
    rare: { tokens: new Set([odd]), share: 0.5 },
  };

  it("names the listed practised chords a loop holds, and rare once", () => {
    expect(new Set(loopShareKeys([I, IV, odd], desired))).toEqual(
      new Set<ShareKey>([I, "rare"]),
    );
    expect(loopShareKeys([IV, V], desired)).toEqual([]);
  });
});

describe("pickNext", () => {
  const desired: DesiredShares = {
    byChord: new Map([
      [I, MASTERED_SHARE],
      [vi, NEW_SHARE],
    ]),
    rare: null,
  };

  it("favours the chord below its share", () => {
    // Ten loops of I and none of vi: the loop holding vi closes the gap.
    const history = Array.from({ length: 10 }, () => [I]);
    expect(pickNext([loop(I, IV), loop(vi, IV)], history, desired)).toEqual(
      loop(vi, IV),
    );
    expect(shareDeficits(history, desired).map((d) => d.key)).toEqual([vi]);
  });

  it("starts from the prior: an empty history reads every chord at its desired share", () => {
    const observed = observedShares([], desired);
    expect(observed.get(I)).toBeCloseTo(MASTERED_SHARE, 10);
    expect(observed.get(vi)).toBeCloseTo(NEW_SHARE, 10);
    expect(shareDeficits([], desired)).toEqual([]);
  });

  it("breaks ties with the given random", () => {
    const a = loop(vi, IV);
    const b = loop(vi, V);
    expect(pickNext([a, b], [], desired, () => 0)).toBe(a);
    expect(pickNext([a, b], [], desired, () => 0.99)).toBe(b);
  });

  it("refuses an empty pool", () => {
    expect(() => pickNext([], [], desired)).toThrow(/empty/);
  });

  it("over a simulated stream, a new chord converges near half the loops and a mastered one near 15 %", () => {
    // Four practised chords: vi new, I, IV and V mastered. Each step the
    // server hands a pool of 12 random loops, each holding at least one
    // practised chord — the way `find` answers.
    const random = seeded(7);
    const practised = [I, IV, V, vi];
    const shares: DesiredShares = {
      byChord: new Map([
        [I, MASTERED_SHARE],
        [IV, MASTERED_SHARE],
        [V, MASTERED_SHARE],
        [vi, NEW_SHARE],
      ]),
      rare: null,
    };
    const randomLoop = () => {
      for (;;) {
        const tokens = practised.filter(() => random() < 0.35);
        if (tokens.length > 0) return loop(...tokens);
      }
    };
    const history: ChordToken[][] = [];
    for (let step = 0; step < 600; step++) {
      const pool = Array.from({ length: 12 }, randomLoop);
      history.push([
        ...pickNext(pool, history, shares, random).window.chordTokens,
      ]);
    }
    const tail = history.slice(200);
    const share = (token: ChordToken) =>
      tail.filter((tokens) => tokens.includes(token)).length / tail.length;
    expect(share(vi)).toBeGreaterThan(NEW_SHARE - 0.08);
    expect(share(vi)).toBeLessThan(NEW_SHARE + 0.08);
    for (const token of [I, IV, V]) {
      expect(share(token)).toBeGreaterThan(MASTERED_SHARE - 0.08);
      expect(share(token)).toBeLessThan(MASTERED_SHARE + 0.08);
    }
  });

  it("counts the rare chords together, as one", () => {
    const withRare: DesiredShares = {
      byChord: new Map([[I, MASTERED_SHARE]]),
      rare: { tokens: new Set([odd, t("2:1-1/0")]), share: NEW_SHARE },
    };
    // Every recent loop held I: a loop with any rare chord is the one wanted.
    const history = Array.from({ length: 10 }, () => [I]);
    expect(pickNext([loop(I), loop(t("2:1-1/0"))], history, withRare)).toEqual(
      loop(t("2:1-1/0")),
    );
  });
});
