// The mark-boundary DEPTH store: has the caret already stepped past the virtual
// delimiter at the boundary it stands on?
//
// ## Why the depth is STORED — outside the document
//
// Not as a workaround for a modelling mistake. **This is the only place the
// caret position's second component can live.** A block's caret position is
// `(Lexical selection, stop ∈ {natural, virtual})`; Lexical owns the first
// component, and it erases both of the document-level addresses the second one
// could have had:
//
//  - **`(rightLeaf, 0)` is rewritten to `(leftLeaf, len)`.**
//    `resolveSelectionPointOnBoundary` (`lexical@0.44.0 Lexical.dev.mjs:7669-7677`)
//    takes a COLLAPSED point at `offset === 0` whose previous sibling is a
//    `TextNode` and sets it to `(prevSibling, prevSibling.getTextContent().length)`.
//    There is no format check — the two runs need not differ in any way. It is
//    reached from `$normalizeSelectionPointsForBoundaries` (`:7701`) inside
//    `$internalResolveSelectionPoints` (`:7743`), i.e. on EVERY DOM→model
//    resolution, and the fast-path bail `shouldSkipSelectionChange` (`:2203`) is
//    `offset !== 0 && offset !== nodeValue.length` — it explicitly does NOT skip
//    at leaf edges, which is exactly where boundaries are.
//  - **An element point at a paragraph edge is coerced to a text point.**
//    `$internalResolveSelectionPoint` (`:7583-7604`) takes the child DOM at the
//    resolved offset and, finding a `TextNode`, returns a text point at that
//    node's edge instead. An element point survives only where the child there
//    is NOT a `TextNode` — a decorator, a `<br>` — which is why
//    `internal/caret-geometry.ts` can use one and a mark boundary cannot.
//
// So both addresses can be SET but not HELD: writing one provokes the
// `selectionchange` that resolves it away again. There is nowhere in the
// document to put the second component, so it lives here, beside the editor.
//
// ## And why it is never DERIVED from `selection.format`
//
// The obvious cheap design is "depth = `selection.format` diverges from the
// anchor node's format bits", leaning on Lexical's own
// `markCollapsedSelectionFormat` carry. It is wrong here, because that divergence
// is ALIASED by three shipped mechanisms, none of which is a delimiter step:
//
//  1. **`FormatShortcutsPlugin`.** Cmd+E on a collapsed caret is a pure selection
//     toggle by design (Lexical's collapsed branch of `formatText`). At the end
//     of a `` `xxxx` `` run it yields `format = N \ {code}` — bit-identical to a
//     step out.
//  2. **`applyInlineFormat`.** It snapshots `preFormat` and restores it onto the
//     post-transform caret, so EVERY successful `**b**` autoformat lands at
//     `format = 0` beside a `{bold}` node — a fabricated depth 1.
//  3. **Programmatic caret landings.** `TextNode.select()` leaves `format`
//     untouched, and `$placeCaretAtLinearOffset` deliberately resolves a run
//     boundary to the END of the earlier leaf — exactly where depth would live.
//     `appendRunsAtJoin` focuses an editor with no prior selection (format 0) and
//     lands at the end of a possibly-bold run.
//
// Under a derived depth, Backspace after ANY of those would strip formatting off
// a whole span instead of deleting one character — an invisible, destructive edit
// on the undo stack. An explicit store makes depth reachable ONLY through
// {@link markStep}, i.e. only through the user's own arrow press, so all three
// take the ordinary character deletion. That gate is the safety property of the
// whole feature.
//
// Lexical's format-divergence carry is in any case only a ~200 ms window keyed on
// `(anchorKey, offset)`, not a durable state. So `selection.format` is the EFFECT
// (what the next typed character carries), re-asserted from this store; never the
// encoding.
//
// ## Why the entry can never be stale
//
// Its own key is its invalidation. It is WRITTEN only by `markStep`; READ only
// after verifying the live selection is still collapsed at exactly that
// `(anchorKey, anchorOffset)`; and CLEARED on any update carrying dirty leaves.
// The `WeakMap` keyed on the editor handles unmount.

import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type RangeSelection,
} from "lexical";
import { MARK_ORDER, type Mark } from "../../core";

/**
 * A recorded delimiter step: the caret position it was taken at, and the mark
 * set the caret carries there (the crossed boundary's `virtualStop().marks`).
 *
 * The marks live in the entry rather than being re-derived from the boundary on
 * every read, because the store IS the truth and `selection.format` is its
 * projection — re-deriving would make the re-assert listener a second, subtly
 * different boundary read.
 */
export interface MarkDepthEntry {
  anchorKey: string;
  anchorOffset: number;
  marks: Mark[];
}

const depths = new WeakMap<LexicalEditor, MarkDepthEntry>();

/**
 * The recorded step for `editor`, or `null`.
 *
 * UNVERIFIED: an entry only means "the caret has stepped past a delimiter" while
 * the live selection is still collapsed at its `(anchorKey, anchorOffset)`. The
 * single consumer (`readCaretContext`) performs that check inside the same
 * editor-state read it derives the rest of the caret context from — which is
 * also why this is a plain accessor rather than a `$`-prefixed read: it must be
 * callable from OUTSIDE a Lexical read, to be passed INTO one.
 */
export function readMarkDepth(editor: LexicalEditor): MarkDepthEntry | null {
  return depths.get(editor) ?? null;
}

/**
 * Inside a Lexical update: make the collapsed selection's pending format carry
 * exactly `marks`.
 *
 * Read with `hasFormat`, written with `formatText` — Lexical's documented
 * collapsed-caret toggle, the same path `FORMAT_TEXT_COMMAND` takes. Never a
 * hand-rolled format bit table: the bit values are Lexical's private business.
 * Only `MARK_ORDER`'s five marks are touched, so any other format bit the
 * selection happens to carry is left exactly as it was.
 *
 * Exported because the delimiter's DELETION must repair the caret too
 * (`removeMarkSpan` sets it to the boundary's residual marks), and there must be
 * exactly one way the caret's pending marks are written.
 */
export function $setCaretMarks(
  selection: RangeSelection,
  marks: readonly Mark[],
): void {
  for (const mark of MARK_ORDER) {
    if (selection.hasFormat(mark) !== marks.includes(mark))
      selection.formatText(mark);
  }
}

/**
 * Cross (or re-cross) a boundary's virtual delimiter: set the caret's pending
 * marks to `marks`, and record the step when `escaped` (clear it when stepping
 * back inside).
 *
 * SELECTION ONLY. No `captureBlockDocEdit`, no `recordDocEdit`, no
 * `discrete: true` — those exist to fence CONTENT mutations off the typing run's
 * undo item, and nothing here changes content. A plain `editor.update()`, exactly
 * like `placeCaretAtOffset` in `caret-geometry.ts`; being enqueued rather than
 * committed synchronously (this runs from a Lexical command listener, i.e. from
 * inside an update) costs nothing, because no boundary is being held open.
 *
 * The store is written from INSIDE the update callback, so the anchor it records
 * is the one the step actually landed on rather than one read a turn earlier.
 */
export function markStep(
  editor: LexicalEditor,
  marks: Mark[],
  escaped: boolean,
): void {
  editor.update(() => $markStep(editor, marks, escaped));
}

/**
 * {@link markStep}'s body, for a caller that is ALREADY inside an
 * `editor.update()`.
 *
 * The split is not a convenience: a caller that has just placed the caret in an
 * un-committed update (a cross-block arrival — `internal/mark-arrival.ts`) must
 * read that pending selection, and `editor.getEditorState()` still returns the
 * COMMITTED one. Deciding and recording inside one update is the only way the
 * anchor recorded here is the anchor the placement produced.
 */
export function $markStep(
  editor: LexicalEditor,
  marks: Mark[],
  escaped: boolean,
): void {
  // Any outcome other than a completed escape leaves NO entry: stepping back
  // inside clears it, and so does a selection that drifted out from under the
  // enqueued update (the same drift-abort the content mutations make, and just
  // as much a non-event).
  depths.delete(editor);
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  $setCaretMarks(selection, marks);
  if (!escaped) return;
  const anchor = selection.anchor;
  depths.set(editor, {
    anchorKey: anchor.key,
    anchorOffset: anchor.offset,
    marks,
  });
}

/**
 * Mount the store's two lifecycle listeners on `editor`. Returns the unregister.
 *
 * - **Invalidate on content change.** Any update carrying dirty leaves means the
 *   text under the caret is not the text the step was taken against, so the entry
 *   is dropped. A selection-only update (the step itself, an ordinary caret move)
 *   dirties no leaves and is therefore not self-defeating.
 * - **Invalidate on the caret LEAVING, and re-assert while it stays.** The entry
 *   is strictly monotonic: the first selection change that is not a collapsed
 *   caret at the recorded anchor kills it, so only another explicit
 *   {@link markStep} can ever re-arm it.
 *
 *   Deleting is not redundant with verifying-on-read, and leaving it out was a
 *   live B1-class hole: node keys are stable for the life of the node, so a click
 *   away and a click BACK to the end of the same line reproduces the very same
 *   `(anchorKey, anchorOffset)` — the entry would verify again and the next
 *   Backspace would strip a mark the user never stepped past. A click cannot
 *   express depth, so depth after one is 0.
 *
 *   While the caret does stay, `selection.format` is re-set from the entry.
 *   Lexical's own divergence carry (`markCollapsedSelectionFormat`) is only a
 *   ~200 ms window keyed on the anchor, so a blur/refocus or a remote patch
 *   lapses it and `onSelectionChange` re-derives the format from the anchor
 *   NODE — the user standing at a virtual stop would silently start typing
 *   marked again. The store is the truth; the format is the projection.
 *
 *   **This cannot loop**, on two independent grounds (checked against Lexical
 *   0.44): the command is dispatched from the DOM `selectionchange` path, and
 *   `$updateDOMSelection` diffs against the native selection — a format-only
 *   change moves no anchor, so it returns before `setBaseAndExtent` and emits no
 *   further `selectionchange`. And were one emitted anyway, the commit calls
 *   `markCollapsedSelectionFormat` with OUR format, so the next
 *   `onSelectionChange` inside 200 ms reuses it instead of re-deriving — every
 *   bit then already matches, `$setCaretMarks` calls `formatText` zero times, and
 *   the selection is never marked dirty. One step to a fixed point.
 *
 *   The re-assert lands one MICROTASK later, not synchronously: an update that
 *   dirties only the selection still commits (`shouldUpdate` counts
 *   `editorStateHasDirtySelection`) but goes through `scheduleMicroTask`. Well
 *   before the next input event, so it is invisible in the app — but a test that
 *   reads the format in the same statement will see the pre-assert value.
 *
 *   Returns `false` so every other `SELECTION_CHANGE_COMMAND` listener still runs.
 */
export function registerMarkDepth(editor: LexicalEditor): () => void {
  const unregister = [
    editor.registerUpdateListener(({ dirtyLeaves }) => {
      if (dirtyLeaves.size > 0) depths.delete(editor);
    }),
    editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const entry = depths.get(editor);
        if (!entry) return false;
        const selection = $getSelection();
        if (
          $isRangeSelection(selection) &&
          selection.isCollapsed() &&
          selection.anchor.key === entry.anchorKey &&
          selection.anchor.offset === entry.anchorOffset
        ) {
          // Still standing where the step was taken — re-assert the effect.
          $setCaretMarks(selection, entry.marks);
          return false;
        }
        // The caret left (a click, an arrow, a range, or no selection at all —
        // block-selection mode drops it entirely). Depth dies with it.
        depths.delete(editor);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  ];
  return () => {
    for (const u of unregister) u();
    depths.delete(editor);
  };
}
