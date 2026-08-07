// Arriving in a block from the OUTSIDE, travelling horizontally.
//
// A block's very first and very last caret positions can be inline-mark
// boundaries, and a boundary holds TWO caret states (`internal/mark-boundary.ts`)
// while `placeCaretAtBoundary` — like the browser — produces exactly one of them,
// always the same one. So the state facing the arrival is reachable from inside
// the block (one arrow press) and NOT reachable by entering it:
//
//   block 1: hello `code`     block 2: |world
//
// one ArrowLeft crosses into block 1 and lands INSIDE the code run, skipping the
// stop the same caret would have stopped at walking rightwards to that position.
// The rule is `markArriveFor`'s, one scope up: land on whichever of the seam's
// two states faces the side the caret came from.
//
// **Only a crossing may assert it.** A click, a focus restore, a `focusBoundary`
// call from host chrome and every explicit placement land `natural` — asserting a
// stop for one of those would arm the `escaped` gate with no arrow press behind
// it, which is exactly the class of bug `internal/mark-depth.ts` exists to
// prevent. The declaration therefore comes from `landCaret`'s horizontal arms
// (`CaretLandOptions.crossing`), never from an inference about `edge`.

import { $getSelection, $isRangeSelection, type LexicalEditor } from "lexical";
import { $readMarkBoundary } from "./caret-geometry";
import { virtualStop } from "./mark-boundary";
import { $markStep } from "./mark-depth";

/**
 * After a horizontal crossing has placed the caret at a block's edge: land it on
 * the mark stop there, if the stop is the state facing `dir`.
 *
 * A no-op for the overwhelmingly common edge that is not a mark boundary, and
 * for the one whose stop is on the far side (where the placement already landed
 * the nearer state — going the other way, that is the press the caret should
 * spend INSIDE the block).
 *
 * Decision and record share ONE `editor.update()`, because the placement it
 * follows is itself an uncommitted update: `editor.getEditorState()` would still
 * hand back the pre-placement selection, and the boundary read would be of the
 * block the caret just left.
 */
export function markStepOnArrival(editor: LexicalEditor, dir: "left" | "right"): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
    const boundary = $readMarkBoundary(selection);
    if (boundary === null) return;
    const stop = virtualStop(boundary);
    if (stop === null || stop.direction === dir) return;
    $markStep(editor, stop.marks, true);
  });
}
