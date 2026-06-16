// Document-level caret geometry for the block editor.
//
// Each block is its own Lexical editor, so caret movement ACROSS blocks can't
// rely on a single editor's line model. This module is the shared, low-level
// layer the coordinator uses:
//   - `readCaretContext` measures the caret in the SOURCE editor: its linear
//     offset, whether it sits at the structural start/end, whether it sits on
//     the first/last VISUAL line (so multi-line blocks only cross at their real
//     top/bottom), and its pixel column (so the column survives the crossing).
//   - `placeCaretAtColumn` / `placeCaretAtBoundary` place the caret in the
//     TARGET editor at that pixel column on the matching visual edge, or at the
//     block's very start/end (Left/Right crossing).
//
// Visual-line detection is font/padding-agnostic: it compares the caret rect to
// reference rects built at the contenteditable's content start/end, never to
// absolute padding. The DOM→Lexical placement uses `caretRangeFromPoint`
// (WebKit/Chrome) / `caretPositionFromPoint` (Firefox) and maps the hit DOM node
// to its Lexical node precisely (no reliance on async selectionchange).

import {
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type LexicalEditor,
} from "lexical";
import {
  $linearCaretOffset,
  $paragraphsPlainLength,
  $placeCaretAtLinearOffset,
} from "./block-text-extensions";

/** A snapshot of the caret in one block editor, consumed by the intent resolver. */
export interface CaretContext {
  /** Linear character offset across the block's paragraphs (split position). */
  offset: number;
  /** Whether the selection is collapsed (a caret, not a range). */
  collapsed: boolean;
  /** Structural: collapsed at offset 0 of the first paragraph. */
  atStart: boolean;
  /** Structural: collapsed at the end of the last paragraph. */
  atEnd: boolean;
  /** Visual: the caret sits on the block's first visual line. */
  onTopLine: boolean;
  /** Visual: the caret sits on the block's last visual line. */
  onBottomLine: boolean;
  /** Viewport x (px) of the caret — preserved when crossing up/down. */
  caretX: number;
}

// --- structural reads -------------------------------------------------------
//
// The linear-offset model lives in `block-text-extensions` (the single source
// matching `splitRuns`/`textOf`/`serializeBlockRuns`). `readCaretContext`'s
// structural read derives offset / atStart / atEnd from `$linearCaretOffset()`
// and `$paragraphsPlainLength()` directly — no bespoke per-helper walk.

// --- visual geometry (DOM measurement) -------------------------------------

/** Collapsed rect at the content start (`atStart=true`) or end of `root`. Null when degenerate (empty editor). */
function contentEdgeRect(root: HTMLElement, atStart: boolean): DOMRect | null {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(atStart);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
    return null;
  }
  return rect;
}

function estimateLineHeight(
  root: HTMLElement,
  startRect: DOMRect | null,
  endRect: DOMRect | null,
): number {
  if (startRect && startRect.height > 0) return startRect.height;
  if (endRect && endRect.height > 0) return endRect.height;
  const cs = getComputedStyle(root);
  const lh = parseFloat(cs.lineHeight);
  if (Number.isFinite(lh) && lh > 0) return lh;
  const fs = parseFloat(cs.fontSize);
  return Number.isFinite(fs) && fs > 0 ? fs * 1.4 : 20;
}

function measureVisualLines(root: HTMLElement): Pick<
  CaretContext,
  "onTopLine" | "onBottomLine" | "caretX"
> {
  const rootRect = root.getBoundingClientRect();
  const startRect = contentEdgeRect(root, true);
  const endRect = contentEdgeRect(root, false);
  const eps = estimateLineHeight(root, startRect, endRect) / 2;

  const sel = window.getSelection();
  let caretRect: DOMRect | null = null;
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (r.width !== 0 || r.height !== 0 || r.top !== 0 || r.left !== 0) caretRect = r;
  }
  if (!caretRect) {
    // Empty block / degenerate collapsed rect → a single empty line; the caret
    // sits at the content start.
    return { onTopLine: true, onBottomLine: true, caretX: startRect?.left ?? rootRect.left };
  }

  const topRef = startRect?.top ?? rootRect.top;
  const bottomRef = endRect?.bottom ?? rootRect.bottom;
  return {
    onTopLine: caretRect.top <= topRef + eps,
    onBottomLine: caretRect.bottom >= bottomRef - eps,
    caretX: caretRect.left,
  };
}

/** Measure the caret in `editor`. Returns null when there is no range selection. */
export function readCaretContext(editor: LexicalEditor): CaretContext | null {
  const structural = editor.getEditorState().read(():
    | { offset: number; collapsed: boolean; atStart: boolean; atEnd: boolean }
    | null => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    // One walk each for the offset and the total; derive start/end from them.
    const off = $linearCaretOffset();
    const total = $paragraphsPlainLength();
    const collapsed = selection.isCollapsed();
    return {
      offset: off ?? 0,
      collapsed,
      atStart: collapsed && off === 0,
      atEnd: collapsed && off === total,
    };
  });
  if (!structural) return null;

  const root = editor.getRootElement();
  if (!root) {
    return { ...structural, onTopLine: true, onBottomLine: true, caretX: 0 };
  }
  return { ...structural, ...measureVisualLines(root) };
}

// --- caret placement (target editor) ---------------------------------------

interface DomCaret {
  node: Node;
  offset: number;
}

/** Cross-browser caret hit-test: WebKit/Chrome `caretRangeFromPoint`, Firefox `caretPositionFromPoint`. */
function caretFromPoint(x: number, y: number): DomCaret | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  if (typeof doc.caretRangeFromPoint === "function") {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  return null;
}

/**
 * Focus `editor` and place a collapsed caret at the linear `offset` (the stored-
 * runs plain-text basis read by `$linearCaretOffset`). The walk is leaf-aware, so
 * a mixed-format paragraph lands the caret at the right run/decorator boundary —
 * used to land the caret at the JOIN point after a Backspace-merge. The offset is
 * clamped to the block's total plain length.
 */
export function placeCaretAtOffset(editor: LexicalEditor, offset: number): void {
  editor.focus();
  editor.update(() => $placeCaretAtOffset(offset));
}

/**
 * Inside an editor update: collapse the caret to the linear `offset` across the
 * block's paragraphs (the body of `placeCaretAtOffset`, delegating to the shared
 * leaf-walking primitive). Exposed so a caller already inside an `editor.update()`
 * (e.g. value-sync's rebuild) can restore the caret without nesting an update.
 */
export function $placeCaretAtOffset(offset: number): void {
  $placeCaretAtLinearOffset(offset);
}

/**
 * Inside an editor read/update: the collapsed caret's linear offset across the
 * block's paragraphs (stored-runs basis), or null when this editor has no
 * collapsed caret (unfocused, or a non-empty range). Lets value-sync capture the
 * caret before a rebuild so an external text change doesn't yank a focused user
 * back to offset 0; the leaf-aware walk keeps the offset correct in formatted
 * paragraphs (previously it returned the anchor-text-node-relative offset).
 */
export function $caretOffsetWithinParagraph(): number | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  return $linearCaretOffset();
}

/** Focus `editor` and collapse the caret to the very start or end of its content. */
export function placeCaretAtBoundary(editor: LexicalEditor, edge: "start" | "end"): void {
  editor.focus();
  editor.update(() => {
    const root = $getRoot();
    if (edge === "start") root.selectStart();
    else root.selectEnd();
  });
}

/**
 * Focus `editor` and place the caret at viewport column `x` on its top or bottom
 * visual line — preserving the column when crossing blocks up/down. Falls back to
 * the block start/end when the point resolves outside the editor.
 */
export function placeCaretAtColumn(
  editor: LexicalEditor,
  x: number,
  edge: "top" | "bottom",
): void {
  const root = editor.getRootElement();
  if (!root) {
    placeCaretAtBoundary(editor, edge === "top" ? "start" : "end");
    return;
  }
  editor.focus();

  const rootRect = root.getBoundingClientRect();
  const startRect = contentEdgeRect(root, true);
  const endRect = contentEdgeRect(root, false);
  const lh = estimateLineHeight(root, startRect, endRect);
  const y =
    edge === "top"
      ? (startRect?.top ?? rootRect.top) + lh / 2
      : (endRect?.bottom ?? rootRect.bottom) - lh / 2;
  const clampedX = Math.min(Math.max(x, rootRect.left + 1), rootRect.right - 1);

  const hit = caretFromPoint(clampedX, y);
  if (!hit || !root.contains(hit.node)) {
    placeCaretAtBoundary(editor, edge === "top" ? "start" : "end");
    return;
  }

  editor.update(() => {
    const node = $getNearestNodeFromDOMNode(hit.node);
    if (!node) {
      const root2 = $getRoot();
      if (edge === "top") root2.selectStart();
      else root2.selectEnd();
      return;
    }
    const sel = $createRangeSelection();
    if ($isTextNode(node)) {
      const off = Math.min(hit.offset, node.getTextContentSize());
      sel.anchor.set(node.getKey(), off, "text");
      sel.focus.set(node.getKey(), off, "text");
    } else {
      sel.anchor.set(node.getKey(), 0, "element");
      sel.focus.set(node.getKey(), 0, "element");
    }
    $setSelection(sel);
  });
}
