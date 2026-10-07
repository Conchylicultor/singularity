import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { LoopExtras } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import {
  canonicalSelection,
  firstSelection,
  type Blanks,
  type RecordedBlanks,
  type SelectedChord,
  type Selection,
} from "../../core";
import { _chordCurriculum } from "./tables";

// ── Reading and writing the selection ────────────────────────────────────────
//
// Every function takes the database as a parameter so a suite can drive it on
// a throwaway.

const ROW_ID = 1;

const COLUMNS = {
  chords: _chordCurriculum.chords,
  blanks: _chordCurriculum.blanks,
  extras: _chordCurriculum.extras,
};

/**
 * The selection a stored row says. `one` (the path's single box) is no longer
 * settable: a row that still holds it reads as `half`, the nearest setting, and
 * the next write stores that.
 */
export function selectionOfRow(row: {
  chords: readonly SelectedChord[];
  blanks: RecordedBlanks;
  extras: LoopExtras;
}): Selection {
  const blanks: Blanks = row.blanks === "one" ? "half" : row.blanks;
  return canonicalSelection({ ...row, blanks });
}

/** What the learner has chosen; `firstSelection()` until they first change anything. */
export async function loadSelection(db: NodePgDatabase): Promise<Selection> {
  const [row] = await db
    .select(COLUMNS)
    .from(_chordCurriculum)
    .where(eq(_chordCurriculum.id, ROW_ID));
  return row === undefined ? firstSelection() : selectionOfRow(row);
}

/**
 * Change the selection in one transaction: read it (locking the row, so two
 * tabs changing it at once apply one after the other), apply `change`, write
 * the result back.
 */
export async function updateSelection(
  db: NodePgDatabase,
  change: (current: Selection) => Selection,
): Promise<Selection> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select(COLUMNS)
      .from(_chordCurriculum)
      .where(eq(_chordCurriculum.id, ROW_ID))
      .for("update");
    const current = row === undefined ? firstSelection() : selectionOfRow(row);
    const next = canonicalSelection(change(current));
    await tx
      .insert(_chordCurriculum)
      .values({ id: ROW_ID, ...next })
      .onConflictDoUpdate({
        target: _chordCurriculum.id,
        set: next,
      });
    return next;
  });
}
