// The mark boundary a caret sits at, and the one virtual delimiter position it
// implies. Pure module (no React, no Lexical, no DOM): unit-tested directly.
//
// ## The model
//
// Inline marks are format BITS on a `TextNode` (`Mark = bold | italic |
// underline | strikethrough | code`), not nodes with edges — so a block that
// ENDS with a marked run traps the caret inside the mark: the caret at
// `offset === getTextContentSize()` is the last position that EXISTS, and there
// is no "outside the span" one. The user's model is that every mark boundary
// holds an invisible one-character delimiter:
//
//   `zz`|    ArrowLeft  →  `zz|`     (step back inside)
//   `zz`|    Backspace  →  zz|       (delete the delimiter = drop the mark)
//
// This module states that model. It says nothing about WHERE the caret is (the
// Lexical read lives in `caret-geometry.ts`) or about DEPTH (the explicit store
// lives in `mark-depth.ts`) — only what a boundary implies once you have one.
//
// ## Two choices that make it small
//
// **A block edge is an empty unmarked neighbour.** Modelling the void before the
// first leaf and after the last one as `[]` is what makes block-start, block-end
// and mid-block a single code path rather than three.
//
// **There is exactly ONE virtual stop at each boundary.** One press crosses the
// whole boundary; one Backspace deletes the whole boundary. Capping at one
// dissolves the nesting-order question outright — the caret never stops between
// two delimiters, so the order in which marks would be exited is unobservable
// and nothing can drift. (`MARK_ORDER` is a STORAGE sort key, not a nesting
// order; do not reach for it here.)
//
// ## THE RULE — and the wrong one that survived 30 assertions
//
// > A boundary has TWO caret states, carrying the LEFT run's marks and the RIGHT
// > run's marks respectively. The browser hands you one of them (`natural`).
// > **The virtual stop is the other one.**
//
// So the stop's mark set is not arithmetic over `left`/`right` — it is a
// SELECTION between them, made by `natural`:
//
//   | boundary            | left   | right  | natural | stop     | direction |
//   |---------------------|--------|--------|---------|----------|-----------|
//   | `` `zz`| `` at end  | {code} | {}     | {code}  | **{}**   | right     |
//   | `` |`zz` `` at start| {}     | {code} | {code}  | **{}**   | left      |
//   | `` `zz`|plain ``    | {code} | {}     | {code}  | **{}**   | right     |
//   | `` plain|`zz` ``    | {}     | {code} | {}      | **{code}**| right    |
//   | `` **a**|`b` ``     | {bold} | {code} | {bold}  | **{code}**| right    |
//
// This module used to say the stop was `left ∩ right`, and 30 e2e assertions
// plus a unit suite agreed with it — because **`L ∩ R` coincides with the rule
// exactly when the stop's own side is a SUBSET of `natural`'s side**, and that
// is true of every boundary the tests covered: at a block edge one side is the
// empty unmarked neighbour, and the measured mid-block seam
// (`` `zz`|plain ``) has `right ⊆ left` too. The first row where the two differ
// is a marked run on the RIGHT of a seam — and there the wrong rule computed
// "the missing state is `{}`, which `natural` already has", i.e. **no stop at
// all**: the caret could never sit inside a code run at its start, so text could
// not be prepended into it. That is the exact mirror of the block-end bug this
// whole feature exists to fix, and it is what "the arrows are not symmetrical"
// meant.
//
// `L ∩ R` is not meaningless — it is the answer to a DIFFERENT question, and it
// still appears below as {@link delimiterDeletion}'s `residual`: what both runs
// keep once the delimiter between them is deleted.

import { MARK_ORDER, type Mark } from "../../core";

/**
 * The two runs meeting at a caret position, plus what the caret's own anchor
 * carries there.
 *
 * `natural` is derived from the anchor NODE's format bits (`marksOfTextNode`),
 * never from `selection.format`. That is deliberate and load-bearing:
 * `selection.format` is aliased by three shipped mechanisms (a collapsed-caret
 * Cmd+E, `applyInlineFormat`'s `preFormat` restore, and programmatic caret
 * landings), so reading it here would make a boundary appear or vanish for
 * reasons that have nothing to do with the document. Node bits are the document.
 *
 * A corollary worth relying on: because none of the three fields reads the
 * selection's pending format, a boundary reads IDENTICALLY at depth 0 and depth
 * 1. Stepping across the delimiter cannot change the answer to "is there a
 * delimiter here", which is what lets the step back in, and the Backspace rung,
 * re-derive the same direction the step out used.
 */
export interface MarkBoundary {
  /** Marks of the run to the LEFT (`[]` at a paragraph edge, decorator, or line break). */
  left: Mark[];
  /** Marks of the run to the RIGHT (`[]` likewise). */
  right: Mark[];
  /** What Lexical derives at this anchor (`marksOfTextNode`; `[]` for element anchors). */
  natural: Mark[];
}

/** The caret state the browser will never hand you at a boundary. */
export interface VirtualStop {
  /**
   * Which arrow crosses from `natural` to the stop — and, mirrored, which arrow
   * crosses back. `"right"` means the stop lies to the right of `natural`, so
   * the delimiter between them is BEHIND a caret standing on the stop (hence
   * Backspace deletes it); `"left"` is the mirror (hence Delete).
   */
  direction: "left" | "right";
  /** The marks the caret carries at the stop: the side `natural` is NOT. */
  marks: Mark[];
}

/** Set equality over two mark arrays, order-insensitive (≤5 elements). */
function sameMarks(a: readonly Mark[], b: readonly Mark[]): boolean {
  return a.length === b.length && a.every((m) => b.includes(m));
}

/** Filter `MARK_ORDER` by a predicate — every mark array here stays canonically sorted. */
function marksWhere(pred: (mark: Mark) => boolean): Mark[] {
  return MARK_ORDER.filter(pred);
}

/**
 * The virtual stop at `b`, or `null` when the boundary needs none.
 *
 * `null` is a non-event, not an absorbed failure — nearly every caret position
 * in a document is one, the same way `$scanInlineFormat` answers `null` for
 * nearly every keystroke.
 *
 * Direction and marks come out of ONE branch on purpose. They used to be two
 * exported functions (`virtualStepDirection` and a `left ∩ right`
 * `boundaryMarks`) that callers paired up, which is precisely how a wrong mark
 * set survived beside a right direction for as long as they agreed by accident.
 *
 * The three arms:
 *
 *  1. **The two sides carry the same marks.** Then there is only one state, the
 *     caret is already standing in it, and there is no boundary to cross —
 *     whatever `natural` says. (Two adjacent `TextNode`s CAN have equal marks:
 *     `coalesce` splits on colour and link too.)
 *  2. **The anchor belongs to the LEFT run** (`natural === left`): the browser
 *     has put the caret on the left side of the seam, so the missing state is
 *     the RIGHT run's and ArrowRight reaches it. Block END is this arm — its
 *     right neighbour is the empty unmarked void, so the stop carries `{}`.
 *  3. **The anchor belongs to the RIGHT run**: mirror image. Block START is this
 *     arm.
 *
 * Falling off the end means the anchor belongs to NEITHER side — an element
 * anchor, whose `natural` is `[]` while the runs around it are marked. There is
 * no run for the caret to have stepped out of, so there is no delimiter to
 * cross.
 */
export function virtualStop(b: MarkBoundary): VirtualStop | null {
  if (sameMarks(b.left, b.right)) return null;
  if (sameMarks(b.natural, b.left)) {
    return {
      direction: "right",
      marks: marksWhere((m) => b.right.includes(m)),
    };
  }
  if (sameMarks(b.natural, b.right)) {
    return { direction: "left", marks: marksWhere((m) => b.left.includes(m)) };
  }
  return null;
}

/**
 * What deleting this boundary's delimiter does to the document.
 *
 * The whole boundary goes in one press, so BOTH runs are reduced to the marks
 * they share and the seam between them disappears. The three fields are that
 * one sentence, split by which side each mark lives on:
 *
 *   `` **a**|`b` ``  →  before `{bold}`, after `{code}`, residual `{}`  →  `ab`
 *   `` `zz`| ``      →  before `{code}`, after `{}`,     residual `{}`  →  `zz`
 *   `` a|`zz` ``     →  before `{}`,     after `{code}`, residual `{}`  →  `azz`
 *
 * Splitting by side is not a refinement — it is what makes the deletion reach
 * the run that actually carries the mark. The strip walks outward from the
 * boundary, and a mark in `right \ left` is on the FAR side of an anchor sitting
 * in the left run: walking the anchor's own side for it finds nothing at all.
 */
export interface DelimiterDeletion {
  /** `left \ right` — spans ENDING at the boundary; stripped walking leftwards. */
  before: Mark[];
  /** `right \ left` — spans STARTING at the boundary; stripped walking rightwards. */
  after: Mark[];
  /**
   * `left ∩ right` — what both sides keep, hence the caret's own marks once the
   * delimiter is gone.
   *
   * The caret needs that repair because it is standing on the STOP, carrying the
   * far side's marks, which the strip is about to take off the far side. (When
   * the stop's side is a subset of `natural`'s — every block edge — this equals
   * the stop's marks and the repair is a no-op, which is why nothing needed it
   * while the stop was miscomputed as `left ∩ right`.)
   */
  residual: Mark[];
}

/** {@link DelimiterDeletion} for `b`. */
export function delimiterDeletion(b: MarkBoundary): DelimiterDeletion {
  return {
    before: marksWhere((m) => b.left.includes(m) && !b.right.includes(m)),
    after: marksWhere((m) => b.right.includes(m) && !b.left.includes(m)),
    residual: marksWhere((m) => b.left.includes(m) && b.right.includes(m)),
  };
}
