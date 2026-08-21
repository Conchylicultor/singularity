import { useCallback, useMemo, useRef, type RefObject } from "react";
import { useMultiSelect } from "@plugins/primitives/plugins/multi-select/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { announce } from "@plugins/primitives/plugins/announce/web";
import type { SelectionControl } from "../selection-control";
import { releaseCaret } from "./caret-authority";
import { rangeWithDescendants, type VisibleBlock } from "./selection-closure";

/**
 * The block list container's ARIA identity, spread onto the element that carries
 * `containerRef`. One value, so the surface and its jsdom spec cannot disagree
 * about what the list claims to be.
 *
 * A NAMED GROUP and nothing more specific, because nothing more specific is true:
 * the rows are `contenteditable` editing hosts, not options. See the editor's
 * `CLAUDE.md`, *The block list is a document, not a listbox*.
 */
export const BLOCK_LIST_ARIA = {
  role: "group",
  "aria-label": "Page blocks",
} as const;

/**
 * The structural surface block-selection mode drives. Passed in rather than read
 * from `useBlockEditor()`, so this machine depends on nothing but React, the
 * multi-select reducer and the `announce` writer — no live state, no optimistic
 * pipeline, no Lexical. That is what makes it mountable (and the focus/keyboard
 * policy below testable) in jsdom. Keep it that way: `announce` qualifies because
 * it is a plain module-level function with no host, no network and no timer.
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
  /**
   * Every rendered block, in document (flattened) order, with the depth it is
   * drawn at. The order is what a range spans; the depth is what tells a range
   * which further rows are children of what it already covers — see
   * `rangeWithDescendants`.
   */
  visible: readonly VisibleBlock[];
  /** The selection's minimal subtree roots — what the structural ops act on. */
  roots: string[];
  /** The block whose text editor currently holds the caret, if any. */
  focusedBlockId: string | null;
  /**
   * How one block reads aloud, e.g. `Heading 2: Container frames` — its type
   * label plus a short preview of its text, degrading to the label alone for a
   * text-less type (divider, image). Used only for the spoken announcements
   * below, never for anything the eye sees.
   *
   * The block list is a `role="group"` of `contenteditable` editing hosts, not a
   * listbox of options, so there is no `aria-selected` to carry the selection —
   * see the editor's `CLAUDE.md`, *The block list is a document, not a listbox*.
   * The three announcement sites below are the replacement channel, and this is
   * how they name a block.
   *
   * Called only from event handlers, so a caller may rebuild it as often as it
   * likes: nothing here holds it in a dependency array.
   */
  describeBlock: (id: string) => string;
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
  visible,
  roots,
  focusedBlockId,
  describeBlock,
  actions,
}: BlockSelectionOptions): BlockSelection {
  const { selectedIds, isActive, setRange, clearAll, selectAll } =
    useMultiSelect();

  const orderedIds = useMemo(() => visible.map((v) => v.id), [visible]);

  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<string | null>(null);
  const headRef = useRef<string | null>(null);
  /**
   * The block the user last AIMED at — the head as they asked for it, before the
   * descendant closure pushed the range's bottom end past it. Kept apart from
   * `headRef` (the real end of the real selection) because one question wants
   * it: Enter puts the caret back where the user was, and pressing Escape on a
   * parent of two then Enter must return to the parent, not drop into its last
   * child.
   */
  const aimedRef = useRef<string | null>(null);

  const focusContainer = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    // Entering block-selection mode is not a pointer/keyboard caret motion the
    // user is chasing — never scroll the viewport to the container.
    container.focus({ preventScroll: true });
    // Both mode-switches that take the keyboard away from a block — this one and
    // the caret authority claiming a landing — drop the text caret through the
    // SAME `releaseCaret`, which is why it lives in `caret-authority.ts` (with
    // the full reconcile-steal rationale). A second copy could drift from the one
    // the authority relies on. Here it is what stops a Yjs echo pulling focus
    // back into the blurred block, which `onFocusCapture` below would then read
    // as "the user clicked into a block" and silently clear the selection over.
    releaseCaret(container);
  }, []);

  // ---- The announcement funnel ----------------------------------------------
  //
  // The range changes in exactly THREE places — here, the Cmd+A branch, and
  // `clearSelection` — so those three are where the selection is spoken. Nothing
  // observes a state to speak it: each site announces the change it just made, so
  // the announcement is exact, push-based, and costs no render.
  //
  // `enterSelectionMode` and `extendTo` deliberately do NOT announce: they route
  // through `applyRange`, and a second call there would speak every entry twice.

  // An event callback, so a `describeBlock` rebuilt on every keystroke (the
  // editor derives it from the flatten, which the ~1s `data.text` projection
  // re-mints) leaves this function's identity — and therefore `control`'s, and
  // therefore every `BlockRow`'s memoized props — untouched.
  const applyRange = useEventCallback((anchor: string, head: string) => {
    // THE closure site. Every range change in the editor arrives here — Escape
    // in a block, a click, Shift+Arrow, a marquee drag — so closing the range
    // over its descendants once, here, is what makes a parent-without-its-
    // children selection unspellable downstream: the reducer, the highlight
    // bands, each row's `isSelected` and the ops all read the one closed range,
    // and none of them has to remember to re-derive it. See
    // `rangeWithDescendants` for why the result is still a range.
    const closed = rangeWithDescendants(visible, { anchor, head });

    // Only a real range CHANGE is spoken. A marquee drag re-applies the same
    // range once per pointermove and once per animation frame while the pointer
    // sits parked at a scrolling edge; the reducer already bails on that, and
    // announcing it would be the same sentence dozens of times a second. The
    // CLOSED ends are what is compared, because they are what was applied — two
    // different raw ranges that close to the same selection are not a change.
    const changed =
      anchorRef.current !== closed.anchor || headRef.current !== closed.head;
    anchorRef.current = closed.anchor;
    headRef.current = closed.head;
    aimedRef.current = head;
    setRange(closed.anchor, closed.head);
    if (!changed) return;

    // The same arithmetic `SET_RANGE` does: the selection IS the inclusive index
    // span between the two ends. An id the ordered list does not carry is the
    // reducer's own no-op case, so there is nothing true to say about it —
    // better silent than a wrong count.
    const anchorIdx = orderedIds.indexOf(closed.anchor);
    const headIdx = orderedIds.indexOf(closed.head);
    if (anchorIdx === -1 || headIdx === -1) return;
    const count = Math.abs(anchorIdx - headIdx) + 1;
    // Named and placed by the block the user AIMED at, sized by what is actually
    // selected: "Text: xxx, block 1 of 4, 3 blocks selected" is what pressing
    // Escape on a parent of two does. Naming the closure's own bottom end
    // instead would announce a block the user never moved onto.
    const aimedIdx = orderedIds.indexOf(head);
    if (aimedIdx === -1) return;
    const position = `block ${aimedIdx + 1} of ${orderedIds.length}`;
    const extent = count > 1 ? `, ${count} blocks selected` : ", selected";
    announce(`${describeBlock(head)}, ${position}${extent}`);
  });

  const clearSelection = useEventCallback(() => {
    // Speak only a clear that cleared something. Focus leaving the block list and
    // the post-delete tidy-up both land here with nothing selected, and "Selection
    // cleared" over an empty selection is a sentence about nothing. The anchor is
    // read BEFORE it is nulled, because nulling it is what makes it false.
    const hadSelection = anchorRef.current !== null;
    anchorRef.current = null;
    headRef.current = null;
    aimedRef.current = null;
    clearAll();
    if (hadSelection) announce("Selection cleared");
  });

  const neighbor = useEventCallback(
    (id: string, dir: "up" | "down"): string | null => {
      const idx = orderedIds.indexOf(id);
      if (idx === -1) return null;
      const next = dir === "down" ? idx + 1 : idx - 1;
      return orderedIds[next] ?? null;
    },
  );

  /**
   * The block a plain arrow leaves the selection FROM: its last block going
   * down, its first going up. Not the head, which is only one of the two ends —
   * and after the descendant closure the head of a range drawn upward sits at
   * its top, so stepping down from it would walk back INTO the selection
   * instead of out of it. (Shift+Arrow still moves the head: that is what
   * extending means.)
   */
  const edge = useEventCallback((dir: "up" | "down"): string | null => {
    const anchor = anchorRef.current;
    const head = headRef.current;
    if (anchor === null) return head;
    if (head === null) return anchor;
    const anchorIdx = orderedIds.indexOf(anchor);
    const headIdx = orderedIds.indexOf(head);
    if (anchorIdx === -1 || headIdx === -1) return head;
    const lower = anchorIdx > headIdx ? anchor : head;
    const upper = anchorIdx < headIdx ? anchor : head;
    return dir === "down" ? lower : upper;
  });

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
      // Select-all has no block the user aimed at, so Enter falls back to the
      // range's end — the same block it has always put the caret in.
      aimedRef.current = null;
      // The third range-change site (see the funnel note above). Naming one block
      // here would be misleading — select-all has no head the user aimed at.
      announce(`All ${orderedIds.length} blocks selected`);
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
      const target = aimedRef.current ?? headRef.current;
      clearSelection();
      if (target) actions.focusBlock(target);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const dir = e.key === "ArrowDown" ? "down" : "up";
      // Extending moves the head; moving leaves from the range's edge. Both are
      // one `neighbor` step — off a different block.
      const from = e.shiftKey
        ? (headRef.current ?? anchorRef.current)
        : edge(dir);
      if (!from) return;
      const next = neighbor(from, dir);
      if (!next) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (e.altKey && e.shiftKey) {
        actions.moveSelection(dir);
      } else if (e.shiftKey) {
        applyRange(anchorRef.current ?? from, next);
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
