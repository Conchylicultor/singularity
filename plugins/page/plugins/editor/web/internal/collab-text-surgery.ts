import {
  $addUpdateTag,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  SKIP_DOM_SELECTION_TAG,
  type LexicalEditor,
} from "lexical";
import { $appendRuns, type RichText } from "../../core";
import {
  $paragraphsPlainLength,
  $placeCaretAtLinearOffset,
  getBlockTextExtensions,
} from "./block-text-extensions";

// Text surgery on a block's BOUND Lexical editor (per-block CRDT plan).
// Split/merge are structural ops that also move TEXT between two content
// docs; the row-level `data.text` rewrite the reducer performs is ignored by
// the bound editor, so the live content must be
// edited too. Driving the change THROUGH LEXICAL (instead of hand-rolling
// `Y.XmlText` deltas) is the idiomatic `@lexical/yjs` path: the
// `CollaborationPlugin` binding syncs the edit into the block's `Y.Doc`
// exactly like typing, so marks and decorator tokens are preserved for free
// and the change fans out through the normal doc-update flush.

/**
 * Inside a Lexical update: delete the content from linear `offset` (the
 * stored-runs plain-text basis — the same basis as the split `position` and
 * `splitRuns`) to the very end. Pure node-graph + model-selection ops, so it
 * runs identically in a live editor and a headless replica (`editYDocState`).
 *
 * The cut is a POSITION, not a CRDT-relative anchor: a concurrent append past
 * `offset` would be swept along with the tail — fine under single-client LIFO,
 * fragile under a virtualized multi-writer target (see `truncateBlockDocFrom`).
 */
export function $truncateFromLinearOffset(offset: number): void {
  if (offset >= $paragraphsPlainLength()) return; // caret at end — nothing to cut
  $placeCaretAtLinearOffset(offset);
  const sel = $getSelection();
  if (!$isRangeSelection(sel)) return;
  // Extend the collapsed caret's focus to the last leaf's end, then delete.
  const last = $getRoot().getLastDescendant();
  if (last === null) return;
  if ($isTextNode(last)) {
    sel.focus.set(last.getKey(), last.getTextContentSize(), "text");
  } else if ($isElementNode(last)) {
    // Empty paragraph as the last node — focus at its (empty) child list end.
    sel.focus.set(last.getKey(), last.getChildrenSize(), "element");
  } else {
    // Atomic leaf (decorator / line break): element position AFTER it.
    const parent = last.getParentOrThrow();
    sel.focus.set(parent.getKey(), last.getIndexWithinParent() + 1, "element");
  }
  if (!sel.isCollapsed()) sel.removeText();
}

/**
 * Delete the block's content from linear `offset` to the very end. The
 * Enter-split truncation: after it, the bound editor (and via the binding, the
 * content doc) holds exactly the HEAD the reducer computed for the row.
 *
 * `discrete: true` is load-bearing (Stage 3b): the caller wraps this call in
 * `captureBlockDocEdit`, whose capture window closes when the wrapper returns —
 * the binding's Yjs transaction must therefore land synchronously (Lexical's
 * default commit is a microtask, which would leak the edit past the boundary
 * and double-record it as a plain text entry).
 *
 * `SKIP_DOM_SELECTION_TAG` is load-bearing too (Stage 4a): this is BACKGROUND
 * surgery on the block the user is LEAVING — the split already moved DOM focus
 * to the new block. Without the tag, reconciling this update's internal
 * selection (the cut point `removeText` leaves) writes it to the DOM, pulling
 * focus back into the origin and stranding the caret there (the new block's
 * caret placement then bails on its activeElement guard).
 */
export function truncateBlockTextFrom(editor: LexicalEditor, offset: number): void {
  editor.update(
    () => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG);
      $truncateFromLinearOffset(offset);
    },
    { discrete: true },
  );
}

/**
 * Focus a CRDT-bound editor that may still be HYDRATING (per-block docs sync
 * async after mount, so a freshly-split/inserted block's root is empty for a
 * beat). Lexical's `editor.focus()` is a selection no-op on an empty root
 * (nothing to select → the reconciler never moves the DOM selection), which
 * left the caret stranded in the previous block. Instead: take DOM focus on
 * the (focusable) empty contenteditable NOW — the user's next keystrokes
 * belong to this block — and collapse the selection to the content START once
 * the first synced content commits (one-shot; skipped if the user moved focus
 * away or already placed a selection by typing meanwhile).
 */
export function focusHydratingAware(editor: LexicalEditor): void {
  const empty = editor.getEditorState().read(() => $getRoot().getChildrenSize() === 0);
  if (!empty) {
    // Non-empty at focus time — since Stage 4a's instant pre-seed this is the
    // NORMAL path for a freshly-split block (the tail is already in). A fresh
    // editor has no prior selection, and `editor.focus()`'s default selection
    // is rootEnd — wrong for a split, whose caret belongs at the content
    // START (before the tail). Explicit rootStart restores the pre-4a one-shot
    // behavior; an editor with a real prior selection restores it (the
    // default only applies when none exists).
    editor.focus(undefined, { defaultSelection: "rootStart" });
    return;
  }
  editor.getRootElement()?.focus();
  const unregister = editor.registerUpdateListener(() => {
    const ready = editor.getEditorState().read(() => $getRoot().getChildrenSize() > 0);
    if (!ready) return;
    unregister();
    if (document.activeElement !== editor.getRootElement()) return;
    const hasSelection = editor.getEditorState().read(() => $getSelection() !== null);
    if (!hasSelection) editor.focus(undefined, { defaultSelection: "rootStart" });
  });
}

/**
 * Append `runs` to the end of the block's content and land the caret at the
 * JOIN offset (the content length before the append) — the Backspace-merge
 * concatenation. Computing the join from the LIVE editor (not `data.text`)
 * keeps the caret exact even when the target has unflushed edits.
 *
 * `discrete: true` for the same capture-boundary reason as
 * {@link truncateBlockTextFrom}: the merge wraps this in `captureBlockDocEdit`.
 */
export function appendRunsAtJoin(editor: LexicalEditor, runs: RichText): void {
  editor.focus();
  editor.update(
    () => {
      const join = $paragraphsPlainLength();
      $appendRuns(runs, getBlockTextExtensions());
      $placeCaretAtLinearOffset(join);
    },
    { discrete: true },
  );
}
