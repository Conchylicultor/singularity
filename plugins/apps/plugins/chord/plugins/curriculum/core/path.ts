import {
  chordTokenFromParts,
  type ChordToken,
} from "@plugins/apps/plugins/chord/plugins/song-index/core";
import type { HookpadMode } from "@plugins/integrations/plugins/hooktheory/core";
import { BLANKS, type Blanks } from "./blanks";
import { sameSelection, type SelectedChord, type Selection } from "./selection";
import type { StageId } from "./stages";

// ── The path: a suggested route through chords × blanks ──────────────────────
//
// The learner sets both axes themselves, any time. The path is only a guide:
// chapters of rows (what a row teaches), each row met at every blanks level.
// A cell (chapter, row, blanks) stands for a selection (`cellSelection`), so
// clicking one sets both axes; and the selection in force can be read back as
// the cell it is (`cellOf`), or as none — free practice.
//
// The rows are a hand-written list (a closed set, so plain data). What a chord
// IS still comes from `stages.ts`: every row's chords belong to one of its
// chapter's stages, which `path.test.ts` checks, so this list cannot drift from
// how the app classifies chords.

/** One thing a chapter teaches: a chord, a few chords heard as one idea, or a key mode. */
export type PathRow = {
  id: string;
  /** How the row is named where a numeral cannot say it: "Home chords", "V/V", "Dorian". */
  name: string;
  /** The chords the row teaches. Empty only for a row that opens a key mode. */
  tokens: readonly ChordToken[];
  /** Key modes the row opens. */
  modes: readonly HookpadMode[];
};

export type Chapter = {
  id: string;
  name: string;
  /** One sentence on what the chapter is about. */
  blurb: string;
  /** The families its rows' chords come from. */
  stages: readonly StageId[];
  rows: readonly PathRow[];
};

/** One square of a chapter's map: a row met at one blanks level. */
export type Cell = { chapter: string; row: string; blanks: Blanks };

const chord = (root: number, intervals: number[], inversion = 0): ChordToken =>
  chordTokenFromParts({ root, intervals, inversion });

const MAJ = [4, 3];
const MIN = [3, 4];
const DIM = [3, 3];

/** A row of chords. */
const row = (id: string, name: string, tokens: ChordToken[]): PathRow => ({
  id,
  name,
  tokens,
  modes: [],
});

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "major",
    name: "Major keys",
    blurb: "The chords a major key builds, starting from home.",
    stages: ["major-triads"],
    rows: [
      {
        id: "home",
        name: "Home chords",
        tokens: [chord(0, MAJ), chord(5, MAJ), chord(7, MAJ)],
        modes: ["major"],
      },
      row("vi", "vi", [chord(9, MIN)]),
      row("ii", "ii", [chord(2, MIN)]),
      row("iii", "iii", [chord(4, MIN)]),
      row("vii", "vii°", [chord(11, DIM)]),
    ],
  },
  {
    id: "minor",
    name: "Minor keys",
    blurb: "A new home chord, i. Loops in minor keys start to play.",
    stages: ["minor-keys"],
    rows: [
      {
        id: "minor-home",
        name: "Minor home",
        tokens: [chord(0, MIN), chord(10, MAJ), chord(8, MAJ)],
        modes: ["minor"],
      },
      row("iv", "iv", [chord(5, MIN)]),
      row("bIII", "♭III", [chord(3, MAJ)]),
      row("v", "v", [chord(7, MIN)]),
      row("ii-dim", "ii°", [chord(2, DIM)]),
    ],
  },
  {
    id: "sevenths",
    name: "Sevenths",
    blurb: "A fourth note on chords you know: same role, new colour.",
    stages: ["sevenths"],
    rows: [
      row("V7", "V7", [chord(7, [4, 3, 3])]),
      row("ii7", "ii7", [chord(2, [3, 4, 3])]),
      row("vi7", "vi7", [chord(9, [3, 4, 3])]),
      row("Imaj7", "Imaj7", [chord(0, [4, 3, 4])]),
      row("IVmaj7", "IVmaj7", [chord(5, [4, 3, 4])]),
      row("viiø7", "viiø7", [chord(11, [3, 3, 4])]),
    ],
  },
  {
    id: "inversions",
    name: "Inversions",
    blurb:
      "A chord you know with another note in the bass. Both inversions of a chord arrive together.",
    stages: ["inversions"],
    rows: [
      row("I-inv", "I inverted", [chord(0, MAJ, 1), chord(0, MAJ, 2)]),
      row("V-inv", "V inverted", [chord(7, MAJ, 1), chord(7, MAJ, 2)]),
      row("IV-inv", "IV inverted", [chord(5, MAJ, 1), chord(5, MAJ, 2)]),
      row("vi-inv", "vi inverted", [chord(9, MIN, 1), chord(9, MIN, 2)]),
    ],
  },
  {
    id: "secondary",
    name: "Secondary dominants",
    blurb: "A dominant that points at a chord other than home.",
    stages: ["secondary"],
    rows: [
      row("V/V", "V/V", [chord(2, MAJ)]),
      row("V/vi", "V/vi", [chord(4, MAJ)]),
      row("V/IV", "V/IV", [chord(0, [4, 3, 3])]),
      row("V/ii", "V/ii", [chord(9, MAJ)]),
    ],
  },
  {
    id: "colour",
    name: "Colour chords",
    blurb:
      "Suspended, added-note and sixth chords: a root you know, a different shade.",
    stages: ["colour"],
    rows: [
      row("sus4", "sus4", [chord(7, [5, 2]), chord(0, [5, 2])]),
      row("sus2", "sus2", [chord(0, [2, 5])]),
      row("add9", "add9", [chord(0, [4, 3, 7])]),
      row("sixths", "Sixths", [chord(0, [4, 3, 2]), chord(5, [4, 3, 2])]),
    ],
  },
  {
    id: "modes",
    name: "Modes",
    blurb:
      "Chords you already know, heard from a different home. Each row opens a key mode, not a chord.",
    stages: ["mixolydian", "dorian", "lydian", "phrygian"],
    rows: [
      {
        id: "mixolydian",
        name: "Mixolydian",
        tokens: [],
        modes: ["mixolydian"],
      },
      { id: "dorian", name: "Dorian", tokens: [], modes: ["dorian"] },
      { id: "lydian", name: "Lydian", tokens: [], modes: ["lydian"] },
      { id: "phrygian", name: "Phrygian", tokens: [], modes: ["phrygian"] },
    ],
  },
];

/** The chapter with this id. Throws when there is none. */
export function chapterById(id: string): Chapter {
  const chapter = CHAPTERS.find((c) => c.id === id);
  if (chapter === undefined) throw new Error(`No chapter "${id}"`);
  return chapter;
}

function rowOf(chapter: Chapter, id: string): { row: PathRow; index: number } {
  const index = chapter.rows.findIndex((r) => r.id === id);
  const found = chapter.rows[index];
  if (found === undefined) {
    throw new Error(`Chapter "${chapter.id}" has no row "${id}"`);
  }
  return { row: found, index };
}

/**
 * The cells the path suggests, in order: a chapter's first row climbs every
 * blanks level; every later row arrives alone (`one`, the earlier rows only
 * heard) and then joins the whole loop (`all`).
 */
export function routeOf(chapter: Chapter): Cell[] {
  return chapter.rows.flatMap((r, i) =>
    (i === 0 ? BLANKS : (["one", "all"] as const)).map((blanks) => ({
      chapter: chapter.id,
      row: r.id,
      blanks,
    })),
  );
}

/** The whole route, every chapter in order. */
export const ROUTE: readonly Cell[] = CHAPTERS.flatMap(routeOf);

export const sameCell = (a: Cell, b: Cell): boolean =>
  a.chapter === b.chapter && a.row === b.row && a.blanks === b.blanks;

/** Whether the path suggests this cell (the rest are off the route, still open). */
export const onRoute = (cell: Cell): boolean =>
  ROUTE.some((c) => sameCell(c, cell));

/**
 * What a cell means as a selection. Everything the path met before this row
 * is practised — earlier chapters whole, and this chapter's earlier rows —
 * except for a later row met at `one`: then the earlier rows of its chapter
 * are only heard, so the new chord is named alone against ones already known.
 * The key modes are every mode the rows up to here open.
 */
export function cellSelection(cell: Cell): Selection {
  const chapterIndex = CHAPTERS.findIndex((c) => c.id === cell.chapter);
  const chapter = CHAPTERS[chapterIndex];
  if (chapter === undefined) throw new Error(`No chapter "${cell.chapter}"`);
  const { index } = rowOf(chapter, cell.row);
  const alone = index > 0 && cell.blanks === "one";

  const chords = new Map<ChordToken, SelectedChord["state"]>();
  const modes = new Set<HookpadMode>();
  const take = (r: PathRow, state: SelectedChord["state"]) => {
    for (const token of r.tokens) chords.set(token, state);
    for (const mode of r.modes) modes.add(mode);
  };
  for (const earlier of CHAPTERS.slice(0, chapterIndex)) {
    for (const r of earlier.rows) take(r, "practice");
  }
  chapter.rows.slice(0, index + 1).forEach((r, i) => {
    take(r, alone && i < index ? "hear" : "practice");
  });

  return {
    chords: [...chords]
      .map(([token, state]) => ({ token, state }))
      .sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0)),
    blanks: cell.blanks,
    modes: [...modes].sort(),
  };
}

/** Where every learner starts: the first cell of the path at `half` (I, IV, V practised). */
export function firstSelection(): Selection {
  const first = CHAPTERS[0]?.rows[0];
  if (first === undefined) throw new Error("the path has no first row");
  return cellSelection({ chapter: "major", row: first.id, blanks: "half" });
}

/** Every cell of every chapter's map. */
export const ALL_CELLS: readonly Cell[] = CHAPTERS.flatMap((chapter) =>
  chapter.rows.flatMap((r) =>
    BLANKS.map((blanks) => ({ chapter: chapter.id, row: r.id, blanks })),
  ),
);

/** The cell this selection is, or null when it is none — free practice. */
export function cellOf(selection: Selection): Cell | null {
  return (
    ALL_CELLS.find((cell) => sameSelection(cellSelection(cell), selection)) ??
    null
  );
}

/** How one chord stands at one blanks level, as the path reads it. */
export type TokenStanding = {
  /** How far along it is, 0…1: accuracy, scaled down while the window is not full. */
  progress: number;
  mastered: boolean;
};

/** How one cell stands: null for a row with no chord to measure (a key mode). */
export type CellStanding = { progress: number; mastered: boolean } | null;

/**
 * A cell's standing from its chords': mastered when every chord of the row is
 * mastered at that blanks level, and as far along as their mean.
 */
export function cellStanding(
  cell: Cell,
  standing: (token: ChordToken, blanks: Blanks) => TokenStanding,
): CellStanding {
  const { row: r } = rowOf(chapterById(cell.chapter), cell.row);
  if (r.tokens.length === 0) return null;
  const each = r.tokens.map((token) => standing(token, cell.blanks));
  return {
    progress: each.reduce((sum, s) => sum + s.progress, 0) / each.length,
    mastered: each.every((s) => s.mastered),
  };
}

/**
 * The cell the path suggests next: the first route cell with something to
 * measure that is not mastered yet. Null once every one is.
 */
export function nextCell(
  standing: (token: ChordToken, blanks: Blanks) => TokenStanding,
): Cell | null {
  return (
    ROUTE.find((cell) => {
      const s = cellStanding(cell, standing);
      return s !== null && !s.mastered;
    }) ?? null
  );
}

/** "Home chords · Half": how a cell is named in a sentence. */
export function cellName(cell: Cell): string {
  const { row: r } = rowOf(chapterById(cell.chapter), cell.row);
  return `${r.name} · ${BLANKS_LABEL[cell.blanks]}`;
}

export const BLANKS_LABEL: Record<Blanks, string> = {
  one: "One",
  half: "Half",
  all: "All",
};

/** Every chord the path names, in path order: the order the chord chips and "Your chords" follow. */
export const PATH_TOKENS: readonly ChordToken[] = [
  ...new Set(CHAPTERS.flatMap((c) => c.rows.flatMap((r) => r.tokens))),
];

/** Where a chord sits in path order; chords the path does not name go last, by token. */
export function pathOrder(a: ChordToken, b: ChordToken): number {
  const ia = PATH_TOKENS.indexOf(a);
  const ib = PATH_TOKENS.indexOf(b);
  const ra = ia === -1 ? Infinity : ia;
  const rb = ib === -1 ? Infinity : ib;
  if (ra !== rb) return ra - rb;
  return a < b ? -1 : a > b ? 1 : 0;
}
