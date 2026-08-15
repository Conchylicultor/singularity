// Whether a collapsed caret's PENDING marks are worth saying out loud, and the
// words to say them in. Pure module (no React, no Lexical, no DOM): unit-tested
// directly.
//
// ## The rule
//
// > Say a collapsed caret's pending mark set when the caret stands AT A MARK
// > BOUNDARY — either of its two states — OR when that set DIFFERS from the marks
// > of the text the caret is standing in.
//
// Two arms, and neither subsumes the other.
//
// **The divergent arm** covers every caret whose pending set is invisible because
// nothing around it carries those marks: a collapsed-caret Cmd+E / Cmd+B (which
// can fire on an empty block, where there is no boundary at all), and every
// successful inline autoformat (`applyInlineFormat` restores `preFormat` onto the
// post-transform caret, so typing `**b**` leaves a caret that will type UNMARKED
// text beside a bold run).
//
// **The boundary arm** exists because "the two sides agree, so there is nothing
// remarkable to say" is the WRONG TEST at a boundary — it is exactly the position
// the whole virtual-delimiter feature was built to disambiguate. A boundary holds
// two caret states at ONE pixel and ONE linear offset
// (`internal/mark-boundary.ts`), and the divergent arm alone names only one of
// them:
//
//   `` `xxx|` ``   inside the run   pending {code}, surrounding {code}  → agree
//   `` `xxx`| ``   stepped out      pending {},     surrounding {code}  → differ
//
// Labelling the second and not the first makes the pair asymmetric, which
// half-defeats the affordance: the user sees a word appear when they step out and
// nothing when they step back, so the two states are still not mutually
// distinguishable. With the boundary arm they read `code` ⇄ `plain`.
//
// `atBoundary` is the caller's `virtualStop(boundary) !== null` — the same one
// fact the arrow step and the Backspace rung ask, so the chip cannot claim a
// boundary the caret model does not have. An ELEMENT anchor (an empty block, a
// position beside a decorator) answers `null` there, and that is correct: the
// caret has stepped out of neither side, so it is covered by the divergent arm
// alone.
//
// ## What it costs
//
// The cue is no longer fully self-extinguishing. Typing one character still ends
// the divergent arm — the new run carries the pending marks, so the two sides
// agree — but a character typed INSIDE a marked run at a block edge leaves the
// caret on a boundary (the run to its right is the empty unmarked void), so the
// chip stays, reading the run's own marks. Typing plain text shows nothing, and
// typing after stepping OUT of a run shows nothing (the new unmarked run's right
// neighbour is that same void, so there is no seam).
//
// ## Why a discriminated union and not `Mark[] | null`
//
// `[]` is a LEGITIMATE displayable value here — it is the `plain` cue, and the
// most important one the affordance has (it is what a caret that has just
// stepped out of a `` `code` `` run reads). `null` would mean "nothing to show",
// so a `Mark[] | null` return puts the two answers a consumer must tell apart
// into one slot, where the interesting case is absorbed into the empty one —
// precisely the absorbable-failure shape the repo's guardrail bans. The `kind`
// tag makes "nothing to say" and "say that nothing is applied" two different
// values.
//
// ## Why the labels live HERE and not in `core/`
//
// `Mark` is closed core data, but these words are UI COPY — and in a different
// REGISTER from the `label` prop the toolbar's mark buttons carry: `"Code"`
// names an action you can take, `"code"` describes the state the next character
// will be in. They are not a duplicate of those, and this module is their only
// reader.

import { MARK_ORDER, sortMarks, type Mark } from "../../core";

/** What the caret will type with, and whether that is worth saying. */
export type CaretFormatCue =
  /** An unremarkable caret away from any boundary. Show nothing. */
  | { kind: "silent" }
  /** The marks the next character will carry. May be `[]` — that is "plain". */
  | { kind: "shown"; marks: Mark[] };

/**
 * Decide what a collapsed caret should say.
 *
 * `pending` is what the next typed character will carry, `surrounding` the marks
 * of the text the caret stands in, and `atBoundary` whether the caret sits at a
 * mark boundary (the caller's `virtualStop(boundary) !== null`).
 *
 * The comparison is order-insensitive on purpose. Both arrays happen to arrive
 * canonically sorted today (`pending` off a `MARK_ORDER` scan of
 * `selection.hasFormat`, `surrounding` off `marksOfTextNode`), but making it
 * depend on that would turn a future caller's differently-ordered array into a
 * permanent spurious divergence — a cue that never goes away. The shown marks
 * come back in canonical `MARK_ORDER` order, so the label is a function of the
 * SET.
 */
export function caretFormatCue(input: {
  pending: readonly Mark[];
  surrounding: readonly Mark[];
  atBoundary: boolean;
}): CaretFormatCue {
  const { pending, surrounding, atBoundary } = input;
  const same =
    pending.length === surrounding.length &&
    pending.every((mark) => surrounding.includes(mark));
  if (same && !atBoundary) return { kind: "silent" };
  return { kind: "shown", marks: sortMarks(pending) };
}

/**
 * The cue's copy, one word per mark.
 *
 * `Record<Mark, string>` rather than a partial map, so adding a sixth mark to
 * `Mark` is a tsc error here — the alternative is a mark that silently renders
 * as `undefined` in the one place the user reads what they are about to type.
 */
const MARK_LABELS: Record<Mark, string> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  code: "code",
};

/**
 * The cue's whole text for a mark set: `[]` → `"plain"`, otherwise the marks'
 * labels in canonical `MARK_ORDER` order, space-separated (`"bold code"`).
 *
 * Driven off `MARK_ORDER` rather than off the argument's own order, so the label
 * is a function of the set alone and cannot read differently for two arrays
 * carrying the same marks.
 */
export function cueLabel(marks: readonly Mark[]): string {
  if (marks.length === 0) return "plain";
  return MARK_ORDER.filter((mark) => marks.includes(mark))
    .map((mark) => MARK_LABELS[mark])
    .join(" ");
}
