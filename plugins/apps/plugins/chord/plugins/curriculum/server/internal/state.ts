import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  curriculumFromSteps,
  type Curriculum,
  type NextStep,
} from "../../core";
import { _chordUnlocks } from "./tables";

// ── Reading and writing the steps taken ──────────────────────────────────────
//
// A handful of rows, in order. Every function takes the database as a
// parameter so a suite can drive it on a throwaway.

/**
 * What the learner has unlocked, read back from their steps.
 *
 * The rows' levels must be exactly 2, 3, 4… : they are the ladder, and a gap
 * would mean a step was deleted from the middle, which nothing does. A gap
 * throws rather than being read over, since every level after it would then be
 * wrong.
 */
export async function loadCurriculum(db: NodePgDatabase): Promise<Curriculum> {
  const rows = await db
    .select({ position: _chordUnlocks.position, step: _chordUnlocks.step })
    .from(_chordUnlocks)
    .orderBy(_chordUnlocks.position);
  rows.forEach((row, index) => {
    const expected = index + 2;
    if (row.position !== expected) {
      throw new Error(
        `chord_unlocks: expected level ${expected} as step ${index + 1}, found ${row.position} — the ladder has a gap`,
      );
    }
  });
  return curriculumFromSteps(rows.map((row) => row.step));
}

/** Record a step. Returns the level it reached. */
export async function appendStep(
  db: NodePgDatabase,
  step: NextStep,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ position: _chordUnlocks.position })
      .from(_chordUnlocks)
      .orderBy(desc(_chordUnlocks.position))
      .limit(1);
    const position = (last?.position ?? 1) + 1;
    await tx.insert(_chordUnlocks).values({ position, step });
    return position;
  });
}

export type UndoResult =
  /** The level the learner is back on. */
  | { kind: "undone"; level: number; step: NextStep }
  | { kind: "nothing-to-undo" };

/** Drop the last step taken, so a mis-click costs nothing. */
export async function dropLastStep(db: NodePgDatabase): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [last] = await tx
      .select({ position: _chordUnlocks.position, step: _chordUnlocks.step })
      .from(_chordUnlocks)
      .orderBy(desc(_chordUnlocks.position))
      .limit(1);
    if (last === undefined) return { kind: "nothing-to-undo" as const };
    await tx
      .delete(_chordUnlocks)
      .where(eq(_chordUnlocks.position, last.position));
    return {
      kind: "undone" as const,
      level: last.position - 1,
      step: last.step,
    };
  });
}
