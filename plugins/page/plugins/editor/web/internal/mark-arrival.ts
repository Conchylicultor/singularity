// Arriving at a mark boundary, by ANY announced crossing.
//
// A mover that relocates a caret ACROSS something announces the crossing on one
// channel (`primitives/text-editor/caret-motion`), in the direction of travel.
// This module is the page editor's observer of it. Whatever was crossed — a
// block seam, an inline decorator, a step within the block — the caret may have
// landed on an inline-mark boundary, and a boundary holds TWO caret states
// (`internal/mark-boundary.ts`) while every placement produces exactly one of
// them, always the same one. So the state facing the arrival is reachable from
// inside (one arrow press) and NOT reachable by arriving:
//
//   block 1: hello `code`     block 2: |world
//
// one ArrowLeft crosses into block 1 and lands INSIDE the code run, skipping the
// stop the same caret would have stopped at walking rightwards to that position.
// The rule is `markArriveFor`'s, one scope up: land on whichever of the seam's
// two states faces the side the caret came from.
//
// **Only a crossing may assert it.** A click, a focus restore, a `focusBoundary`
// call from host chrome and every explicit placement announce nothing and land
// `natural` — asserting a stop for one of those would arm the `escaped` gate with
// no arrow press behind it, which is exactly the class of bug
// `internal/mark-depth.ts` exists to prevent. The direction therefore comes from
// the ANNOUNCEMENT, declared by the mover that knows it crossed — no longer from
// a flag the one caller that crossed happened to set, and never from an inference
// about a selection transition (which cannot tell a one-character click from a
// one-character arrow step).

import { CARET_CROSSED_COMMAND } from "@plugins/primitives/plugins/text-editor/plugins/caret-motion/web";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  type LexicalEditor,
} from "lexical";
import { $readMarkBoundary } from "./caret-geometry";
import { virtualStop } from "./mark-boundary";
import { $markStep } from "./mark-depth";

/**
 * Observe `editor`'s caret crossings: after each one, land the caret on the mark
 * stop at the boundary it arrived at, when that stop is the state facing the
 * direction it travelled. Returns the unregister.
 *
 * A no-op for the overwhelmingly common arrival that is not at a mark boundary,
 * and for the one whose stop is on the far side (where the placement already
 * landed the nearer state — going the other way, that is the press the caret
 * should spend INSIDE the run).
 *
 * Decision and record share the ANNOUNCING update, and that is the whole reason
 * the channel is a Lexical command rather than a callback: a listener runs
 * inside the announcer's own update, so it reads the pending selection the
 * crossing just produced. `editor.getEditorState()` would still hand back the
 * committed one — for a cross-block arrival, the selection of the block the
 * caret just left. Opening an `editor.update()` here (which is how this read the
 * right selection while it had exactly one caller) would now be a second, later
 * turn.
 *
 * Returns `false` so every other `CARET_CROSSED_COMMAND` observer still runs.
 */
export function registerMarkArrival(editor: LexicalEditor): () => void {
  return editor.registerCommand(
    CARET_CROSSED_COMMAND,
    ({ direction }) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        return false;
      const boundary = $readMarkBoundary(selection);
      if (boundary === null) return false;
      const stop = virtualStop(boundary);
      if (stop === null || stop.direction === direction) return false;
      $markStep(editor, stop.marks, true);
      return false;
    },
    COMMAND_PRIORITY_LOW,
  );
}
