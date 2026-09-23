import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { canonicalSelection, firstSelection, type Selection } from "../../core";
import { _chordCurriculum } from "./tables";

// ── Reading and writing the selection ────────────────────────────────────────
//
// Every function takes the database as a parameter so a suite can drive it on
// a throwaway.

const ROW_ID = 1;

/** What the learner has chosen; `firstSelection()` until they first change anything. */
export async function loadSelection(db: NodePgDatabase): Promise<Selection> {
  const [row] = await db
    .select({
      chords: _chordCurriculum.chords,
      blanks: _chordCurriculum.blanks,
      modes: _chordCurriculum.modes,
    })
    .from(_chordCurriculum)
    .where(eq(_chordCurriculum.id, ROW_ID));
  return row === undefined ? firstSelection() : canonicalSelection(row);
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
      .select({
        chords: _chordCurriculum.chords,
        blanks: _chordCurriculum.blanks,
        modes: _chordCurriculum.modes,
      })
      .from(_chordCurriculum)
      .where(eq(_chordCurriculum.id, ROW_ID))
      .for("update");
    const current =
      row === undefined ? firstSelection() : canonicalSelection(row);
    const next = canonicalSelection(change(current));
    await tx
      .insert(_chordCurriculum)
      .values({ id: ROW_ID, ...next })
      .onConflictDoUpdate({
        target: _chordCurriculum.id,
        set: { ...next, updatedAt: new Date() },
      });
    return next;
  });
}
