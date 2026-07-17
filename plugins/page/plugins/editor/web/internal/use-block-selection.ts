import { useCallback, useMemo, useRef, type RefObject } from "react";
import { useMultiSelect } from "@plugins/primitives/plugins/multi-select/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import type { SelectionControl } from "../selection-control";

/**
 * The structural surface block-selection mode drives. Passed in rather than read
 * from `useBlockEditor()`, so this machine depends on nothing but React and the
 * multi-select reducer — no live state, no optimistic pipeline, no Lexical. That
 * is what makes it mountable (and the focus/keyboard policy below testable) in
 * jsdom.
 */
export interface BlockSelectionActions {
  /** Indent the selection's subtree roots one level. */
  indent: (roots: string[]) => void;
  /** Outdent the selection's subtree roots one level. */
  outdent: (roots: string[]) => void;
  /** Delete the selected blocks (and their subtrees). */
  remove: (ids: string[]) => void;
  /** Duplicate the selected blocks. */
  duplicate: (ids: string[]) => void;
  /** Put the caret back into a block's text editor. */
  focusBlock: (id: string) => void;
  /** Nudge the whole selection one slot up/down among its siblings. */
  moveSelection: (dir: "up" | "down") => void;
}

export interface BlockSelectionOptions {
  /** Every rendered block id, in document (flattened) order. */
  orderedIds: readonly string[];
  /** The selection's minimal subtree roots — what the structural ops act on. */
  roots: string[];
  /** The block whose text editor currently holds the caret, if any. */
  focusedBlockId: string | null;
  actions: BlockSelectionActions;
}

/**
 * DESTRUCTURE this at the call site (`const { containerRef, control, onKeyDown } =
 * useBlockSelection(...)`). The object carries refs, so `react-hooks/refs` reads any
 * later `selection.foo` during render as a ref access. Only the two refs a consumer
 * genuinely needs are exposed.
 */
export interface BlockSelection {
  /**
   * The focusable interaction surface. Block-selection mode lives on THIS element:
   * it is the keyboard and clipboard target while no block editor holds the caret.
   */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The imperative control handed to deep children through `SelectionControlProvider`. */
  control: SelectionControl;
  /** The range's head, readable from imperative DOM handlers (clipboard anchoring). */
  headRef: RefObject<string | null>;
  applyRange: (anchor: string, head: string) => void;
  clearSelection: () => void;
  focusContainer: () => void;
  /** Wire onto the container element — see the origin-guard note below. */
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocusCapture: (e: React.FocusEvent) => void;
}

/**
 * Drop the text caret when block-selection mode takes the keyboard.
 *
 * Moving DOM focus to the container does NOT move the DOM selection: the caret
 * stays parked in the text node of the block the user just left. That residue is
 * not cosmetic — it is what lets a blurred block steal focus back:
 *
 * Lexical re-derives every commit's pending selection from the DOM selection
 * (`$internalCreateSelection` reads it whenever the update has no originating
 * event, i.e. any async/microtask-scheduled commit). Reconciling a selection whose
 * DOM position is unchanged while `document.activeElement` is outside the editor
 * root reads to Lexical as "the caret didn't move, so my root should have focus" —
 * and it calls `rootElement.focus()`. Lexical guards that steal for its own remote
 * collab updates (`COLLABORATION_TAG`), but `@lexical/yjs` issues an UNTAGGED
 * follow-up commit (`$ensureEditorNotEmpty`) deliberately outside the tagged block,
 * which the guard therefore never sees. So any Yjs update landing on a just-blurred
 * block — a content-doc hydration echo, another client's edit — pulls focus back
 * into that block a beat later, with no user input; `onFocusCapture` below then
 * reads the non-container focus as "the user clicked into a block" and silently
 * destroys their selection. Because the block-editor's clipboard handlers gate on
 * `document.activeElement`, a subsequent paste also falls through to the caret path
 * and lands in the wrong place.
 *
 * We cannot tag that commit — it is issued inside the library, with no
 * update-options seam to reach it (unlike the app's own split-truncation, which
 * tags itself with `SKIP_DOM_SELECTION_TAG` in `collab-text-surgery.ts`). So drop
 * the DOM selection instead: with no caret in the block, a reconcile has nothing to
 * restore and no reason to reclaim focus. That holds against ANY async refocus, not
 * just this one trigger.
 *
 * Only ever clears a selection inside the container — a selection elsewhere on the
 * page is not ours to drop. See `research/2026-07-17-page-block-selection-focus-steal.md`.
 */
function releaseCaret(container: HTMLElement): void {
  const sel = container.ownerDocument.defaultView?.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (!container.contains(sel.anchorNode)) return;
  sel.removeAllRanges();
}

/**
 * Block-selection mode: the range state, the container's focus/keyboard policy, and
 * the `SelectionControl` deep children drive it with.
 *
 * ## The origin guard (why `e.target`, never `document.activeElement`)
 *
 * The container is an ANCESTOR of every block's text editor, and React delegates its
 * `onKeyDown` from the root — so a keystroke a block already consumed still bubbles
 * here afterwards. The container must therefore answer "did this keystroke originate
 * on ME?", and the only immutable record of that is the event's own `e.target`.
 *
 * Asking `document.activeElement === containerRef.current` instead is a
 * time-of-check/time-of-use bug, because an inner handler can move focus DURING the
 * dispatch. That is exactly what `enterSelectionMode` does: Lexical's native listener
 * on the block's `contenteditable` fires first, applies the range, and calls
 * `focusContainer()`. The synchronous `focusin` is a discrete event, so React flushes
 * the pending reducer update before dispatching it; by the time the still-bubbling
 * keydown reaches the container, `activeElement` IS the container and `isActive` IS
 * true — so an `activeElement`-guarded handler claims the event and re-runs its own
 * `Escape → clear` branch over the selection Escape just created. (Shift+Arrow at a
 * block edge hit the same trap, extending the range twice off one keypress.)
 *
 * `e.target` is fixed at dispatch time and cannot be moved by a handler, so the guard
 * holds no matter who focuses what mid-flight. See
 * `research/2026-07-10-page-escape-block-selection.md`.
 *
 * The CLIPBOARD handlers in `block-editor.tsx` deliberately keep the `activeElement`
 * check: they ask a different question — "does the container own the clipboard right
 * now?" — and a `copy` event's target follows the DOM selection, not focus.
 */
export function useBlockSelection({
  orderedIds,
  roots,
  focusedBlockId,
  actions,
}: BlockSelectionOptions): BlockSelection {
  const { selectedIds, isActive, setRange, clearAll, selectAll } = useMultiSelect();

  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const headRef = useRef<string | null>(null);

  const focusContainer = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    // Entering block-selection mode is not a pointer/keyboard caret motion the
    // user is chasing — never scroll the viewport to the container.
    container.focus({ preventScroll: true });
    releaseCaret(container);
  }, []);

  const applyRange = useCallback(
    (anchor: string, head: string) => {
      anchorRef.current = anchor;
      headRef.current = head;
      setRange(anchor, head);
    },
    [setRange],
  );

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    headRef.current = null;
    clearAll();
  }, [clearAll]);

  const neighbor = useEventCallback(
    (id: string, dir: "up" | "down"): string | null => {
      const idx = orderedIds.indexOf(id);
      if (idx === -1) return null;
      const next = dir === "down" ? idx + 1 : idx - 1;
      return orderedIds[next] ?? null;
    },
  );

  const enterSelectionMode = useEventCallback(
    (blockId: string, extend?: "up" | "down") => {
      if (!extend) {
        applyRange(blockId, blockId);
      } else {
        const target = neighbor(blockId, extend) ?? blockId;
        applyRange(blockId, target);
      }
      focusContainer();
    },
  );

  const extendTo = useEventCallback((blockId: string) => {
    const anchor = anchorRef.current ?? focusedBlockId ?? blockId;
    applyRange(anchor, blockId);
    focusContainer();
  });

  // Stable across renders: every member is an event callback or a ref-only helper,
  // so deep children (every `BlockRow`) never re-render because the head moved.
  const control = useMemo<SelectionControl>(
    () => ({ enterSelectionMode, extendTo, clear: clearSelection }),
    [enterSelectionMode, extendTo, clearSelection],
  );

  // ---- Container focus + keyboard policy ------------------------------------

  const onFocusCapture = useEventCallback((e: React.FocusEvent) => {
    // Focusing into a block's editor (clicking to type) drops any block selection.
    // Focusing the container itself (entering selection mode) doesn't.
    if (e.target !== containerRef.current && isActive) clearSelection();
  });

  const onKeyDown = useEventCallback((e: React.KeyboardEvent) => {
    // The origin guard. Not `document.activeElement` — see the note above.
    if (e.target !== containerRef.current) return;
    if (!isActive) return;
    const mod = e.metaKey || e.ctrlKey;

    // Undo/redo (Cmd+Z / Cmd+Shift+Z / Cmd+Y) is NOT handled here — it routes
    // through the surface-level `useUndoRedoShortcuts` binding (focus-independent,
    // scoped to this tab), so it works the same whether a block editor, this
    // selection container, or <body> holds focus.

    if (e.key === "Escape") {
      e.preventDefault();
      clearSelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAll();
      anchorRef.current = orderedIds[0] ?? null;
      headRef.current = orderedIds[orderedIds.length - 1] ?? null;
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      actions.duplicate([...selectedIds]);
      return;
    }
    // `!mod` leaves Ctrl+Tab (browser tab switch) alone.
    if (e.key === "Tab" && !mod) {
      // Always consume: Tab must never walk DOM focus out of a live block
      // selection, even when the reducer refuses the move (mirrors the in-block
      // `noop` intent). The selection survives the reparent — the blocks keep
      // their ids, so their rows just re-render one level over.
      e.preventDefault();
      if (e.shiftKey) actions.outdent(roots);
      else actions.indent(roots);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      actions.remove([...selectedIds]);
      clearSelection();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const head = headRef.current;
      clearSelection();
      if (head) actions.focusBlock(head);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const dir = e.key === "ArrowDown" ? "down" : "up";
      const head = headRef.current ?? anchorRef.current;
      if (!head) return;
      const next = neighbor(head, dir);
      if (!next) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.altKey && e.shiftKey) {
        actions.moveSelection(dir);
      } else if (e.shiftKey) {
        applyRange(anchorRef.current ?? head, next);
      } else {
        applyRange(next, next);
      }
    }
  });

  return {
    containerRef,
    control,
    headRef,
    applyRange,
    clearSelection,
    focusContainer,
    onKeyDown,
    onFocusCapture,
  };
}
