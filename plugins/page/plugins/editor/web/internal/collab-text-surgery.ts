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

/**
 * Lexical's `skip-scroll-into-view` update tag: suppresses the scroll-into-view
 * a collapsed-selection reconcile otherwise runs. Passed on no-scroll landings.
 */
const SKIP_SCROLL_TAG = "skip-scroll-into-view";

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
 * `focus()`'s ONE landing policy, in both scroll modes:
 *
 * > **An existing selection wins; only a selection-less editor lands at the
 * > content START.**
 *
 * The first half is what makes `focus()` safe to call on the block that ALREADY
 * holds the caret — which every structural op that keeps the user in place does
 * (Tab-indent / Shift+Tab-outdent re-focus their own block after the move). The
 * second half is the freshly-split/inserted case: a brand-new editor has no
 * prior selection, and Lexical's default is rootEnd — wrong for a split, whose
 * caret belongs BEFORE the tail.
 *
 * `scroll: true` is literally Lexical's `editor.focus()`, which already encodes
 * exactly this (`selection.dirty = true` when one exists, else the
 * `defaultSelection`). The no-scroll arm has to hand-roll it — `editor.focus()`
 * offers no `preventScroll` — so it must reproduce BOTH halves: marking the live
 * selection dirty is what forces the reconciler to write it back to the DOM,
 * the same restore `editor.focus()` performs. Dropping that half (an
 * unconditional `$getRoot().selectStart()`) is what silently sent the caret home
 * on every Tab.
 */
function focusRestoringSelection(editor: LexicalEditor, scroll: boolean): void {
  if (scroll) {
    editor.focus(undefined, { defaultSelection: "rootStart" });
    return;
  }
  // No-scroll: focus the root directly (`preventScroll`) and land the caret
  // under the skip-scroll tag so the reconcile doesn't scroll either.
  editor.getRootElement()?.focus({ preventScroll: true });
  editor.update(
    () => {
      const selection = $getSelection();
      if (selection !== null) selection.dirty = true;
      else $getRoot().selectStart();
    },
    { tag: SKIP_SCROLL_TAG },
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
 *
 * Both paths land through {@link focusRestoringSelection}, so an editor that
 * already holds a caret keeps it and only a selection-less one is placed.
 * `scroll` (default false) declares whether the landing follows the caret into
 * view.
 */
export function focusHydratingAware(editor: LexicalEditor, scroll = false): void {
  const empty = editor.getEditorState().read(() => $getRoot().getChildrenSize() === 0);
  if (!empty) {
    // Non-empty at focus time — since Stage 4a's instant pre-seed this is the
    // NORMAL path both for a freshly-split block (the tail is already in, no
    // selection yet → content start) and for a re-focus of the block the user
    // is already editing (selection present → restored untouched).
    focusRestoringSelection(editor, scroll);
    return;
  }
  editor.getRootElement()?.focus(scroll ? undefined : { preventScroll: true });
  const unregister = editor.registerUpdateListener(() => {
    const ready = editor.getEditorState().read(() => $getRoot().getChildrenSize() > 0);
    if (!ready) return;
    unregister();
    if (document.activeElement !== editor.getRootElement()) return;
    const hasSelection = editor.getEditorState().read(() => $getSelection() !== null);
    if (!hasSelection) focusRestoringSelection(editor, scroll);
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
 *
 * `scroll` defaults to TRUE: a Backspace-merge wants the joined caret revealed,
 * so callers keep today's `editor.focus()` + untagged update. A no-scroll caller
 * focuses the root with `preventScroll` and tags the update to suppress the
 * reconcile scroll.
 */
export function appendRunsAtJoin(
  editor: LexicalEditor,
  runs: RichText,
  scroll = true,
): void {
  if (scroll) editor.focus();
  else editor.getRootElement()?.focus({ preventScroll: true });
  editor.update(
    () => {
      const join = $paragraphsPlainLength();
      $appendRuns(runs, getBlockTextExtensions());
      $placeCaretAtLinearOffset(join);
    },
    scroll ? { discrete: true } : { discrete: true, tag: SKIP_SCROLL_TAG },
  );
}
