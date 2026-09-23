import { describe, expect, test } from "bun:test";
import {
  parseChordToken,
  chordTokenFromParts,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  ALL_CELLS,
  CHAPTERS,
  ROUTE,
  cellOf,
  cellSelection,
  cellStanding,
  firstSelection,
  nextCell,
  routeOf,
  type TokenStanding,
} from "./path";
import { chordState, practisedChords } from "./selection";
import { stageOf } from "./stages";

const I = "0:4-3/0" as ChordToken;
const IV = "5:4-3/0" as ChordToken;
const V = "7:4-3/0" as ChordToken;
const vi = "9:3-4/0" as ChordToken;

describe("the chapters", () => {
  test("every row's chords belong to one of its chapter's stages", () => {
    // Inversions are in their family once the root position is known: count
    // every root-position chord the path names as known.
    const known = new Set(
      CHAPTERS.flatMap((c) => c.rows.flatMap((r) => r.tokens)).map((t) =>
        chordTokenFromParts({ ...parseChordToken(t), inversion: 0 }),
      ),
    );
    for (const chapter of CHAPTERS) {
      for (const row of chapter.rows) {
        for (const token of row.tokens) {
          const stage = stageOf(token, known);
          expect(
            stage !== null && chapter.stages.includes(stage)
              ? "in its chapter"
              : `${token} in ${chapter.id} is a ${String(stage)} chord`,
          ).toBe("in its chapter");
        }
      }
    }
  });

  test("ids are unique, and only a key-mode row has no chord", () => {
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(CHAPTERS.length);
    for (const chapter of CHAPTERS) {
      expect(new Set(chapter.rows.map((r) => r.id)).size).toBe(
        chapter.rows.length,
      );
      for (const row of chapter.rows) {
        if (row.tokens.length === 0)
          expect(row.modes.length).toBeGreaterThan(0);
      }
    }
  });

  test("no chord is taught twice", () => {
    const all = CHAPTERS.flatMap((c) => c.rows.flatMap((r) => r.tokens));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("the route", () => {
  test("a chapter's first row climbs every level; later rows arrive alone, then join the whole loop", () => {
    const major = CHAPTERS[0];
    if (major === undefined) throw new Error("no first chapter");
    expect(routeOf(major).slice(0, 5)).toEqual([
      { chapter: "major", row: "home", blanks: "one" },
      { chapter: "major", row: "home", blanks: "half" },
      { chapter: "major", row: "home", blanks: "all" },
      { chapter: "major", row: "vi", blanks: "one" },
      { chapter: "major", row: "vi", blanks: "all" },
    ]);
  });
});

describe("cellSelection", () => {
  test("everyone starts on I, IV and V at half, in major keys", () => {
    const first = firstSelection();
    expect(practisedChords(first).sort()).toEqual([I, IV, V].sort());
    expect(first.blanks).toBe("half");
    expect(first.modes).toEqual(["major"]);
  });

  test("a later row met at one is named alone: the rows before it are only heard", () => {
    const s = cellSelection({ chapter: "major", row: "vi", blanks: "one" });
    expect(chordState(s, vi)).toBe("practice");
    expect(chordState(s, I)).toBe("hear");
    expect(chordState(s, "2:3-4/0" as ChordToken)).toBe("off");
  });

  test("met at all, everything so far is practised", () => {
    const s = cellSelection({ chapter: "major", row: "vi", blanks: "all" });
    expect(practisedChords(s).sort()).toEqual([I, IV, V, vi].sort());
  });

  test("a later chapter practises every earlier chapter, and adds its key modes", () => {
    const s = cellSelection({ chapter: "minor", row: "iv", blanks: "one" });
    expect(chordState(s, vi)).toBe("practice");
    expect(chordState(s, "0:3-4/0" as ChordToken)).toBe("hear");
    expect(chordState(s, "5:3-4/0" as ChordToken)).toBe("practice");
    expect(s.modes).toEqual(["major", "minor"]);
  });

  test("an unknown chapter or row throws", () => {
    expect(() =>
      cellSelection({ chapter: "nope", row: "home", blanks: "one" }),
    ).toThrow('No chapter "nope"');
    expect(() =>
      cellSelection({ chapter: "major", row: "nope", blanks: "one" }),
    ).toThrow('has no row "nope"');
  });
});

describe("cellOf", () => {
  test("every cell's selection reads back as that cell", () => {
    for (const cell of ALL_CELLS) {
      const back = cellOf(cellSelection(cell));
      // Two cells can mean the same selection only if they are the same cell,
      // except a first row, where one is not "alone" — then they differ in
      // blanks, which the selection carries too.
      expect(back).toEqual(cell);
    }
  });

  test("a selection no cell makes is free practice", () => {
    const s = cellSelection({ chapter: "major", row: "home", blanks: "all" });
    expect(
      cellOf({ ...s, chords: [...s.chords, { token: vi, state: "hear" }] }),
    ).toBeNull();
  });
});

describe("standing", () => {
  const none: TokenStanding = { progress: 0, mastered: false };
  const done: TokenStanding = { progress: 1, mastered: true };

  test("a cell is mastered when every chord of its row is, and as far along as their mean", () => {
    const cell = { chapter: "major", row: "home", blanks: "one" } as const;
    expect(cellStanding(cell, (t) => (t === I ? none : done))).toEqual({
      progress: 2 / 3,
      mastered: false,
    });
    expect(cellStanding(cell, () => done)).toEqual({
      progress: 1,
      mastered: true,
    });
  });

  test("a key-mode row has nothing to score", () => {
    expect(
      cellStanding(
        { chapter: "modes", row: "dorian", blanks: "all" },
        () => done,
      ),
    ).toBeNull();
  });

  test("the next cell is the first route cell not mastered", () => {
    expect(nextCell(() => none)).toEqual(ROUTE[0] ?? null);
    const homeOne = (t: ChordToken, b: string) =>
      [I, IV, V].includes(t) && b === "one" ? done : none;
    expect(nextCell(homeOne)).toEqual({
      chapter: "major",
      row: "home",
      blanks: "half",
    });
    // Everything with a score mastered: nothing is next.
    expect(nextCell(() => done)).toBeNull();
  });
});
