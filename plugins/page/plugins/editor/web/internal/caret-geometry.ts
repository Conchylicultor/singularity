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
  $isDecoratorNode,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  $isTextNode,
  $setSelection,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode,
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
//
// Everything here is stated in LINE BOXES, never in "the caret's y vs. the
// editor's padded box". A block's soft lines are `<br>`-separated runs inside a
// single `<p>`, so the questions "am I on the first/last visual line" and "where
// is the target line" are answered by comparing the caret's line box to the
// first/last line box — a comparison that needs no epsilon, no padding
// arithmetic, and no computed line-height guess.
//
// The hard part is that a collapsed DOM Range answers `getClientRects()` with
// NOTHING for two positions that occur constantly in this editor:
//   - an EMPTY soft line (the caret sits between two `<br>`s), and
//   - the boundary beside an inline `contenteditable=false` decorator (a chip).
// The previous implementation read those as "no geometry" and substituted
// `{ onTopLine: true, onBottomLine: true }` — an absorbed failure that claims the
// caret is on BOTH edges, which is why ArrowUp/ArrowDown on any empty line inside
// a multi-line block jumped to the neighbouring BLOCK instead of the next line.
// Every rect read below therefore either returns a real box or returns null, and
// null propagates to a structural answer rather than a fabricated visual one.

/** A rect the layout engine actually painted. A collapsed caret is 0-wide but never 0-tall. */
function usable(rect: DOMRect | null | undefined): DOMRect | null {
  if (!rect) return null;
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

/** The topmost (`first`) or bottommost (`last`) painted box among `rects`. */
function pickEdge(rects: DOMRectList, edge: "first" | "last"): DOMRect | null {
  const boxes = [...rects].filter((r) => usable(r));
  if (boxes.length === 0) return null;
  return boxes.reduce((best, r) =>
    edge === "first" ? (r.top < best.top ? r : best) : (r.bottom > best.bottom ? r : best),
  );
}

/**
 * The line box at `node`'s `first`/`last` edge.
 *
 * A wrapped text node reports one client rect per line, so `pickEdge` selects the
 * right end of it. A `<br>` reports NO client rects at all while still occupying a
 * line — hence the bounding-rect fallback. Skipping that fallback is not a
 * cosmetic loss: the trailing `<br>` IS the last line of every block that ends in
 * an empty soft line, so without it the search fell through to the paragraph's
 * own box, whose vertical middle is a gap between two lines.
 *
 * Only ever called on LEAVES, so "the node's box" and "the node's line box" are
 * the same thing.
 */
function nodeLineRect(node: Node | null | undefined, edge: "first" | "last"): DOMRect | null {
  if (!node) return null;
  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) range.selectNodeContents(node);
  else range.selectNode(node);
  return (
    pickEdge(range.getClientRects(), edge) ??
    usable(range.getBoundingClientRect()) ??
    (node.nodeType === Node.ELEMENT_NODE
      ? usable((node as Element).getBoundingClientRect())
      : null)
  );
}

/** Leaves of `node` in document order (`first`) or reverse (`last`). */
function* leavesFrom(node: Node, edge: "first" | "last"): Generator<Node> {
  if (!node.hasChildNodes()) {
    yield node;
    return;
  }
  const children = [...node.childNodes];
  if (edge === "last") children.reverse();
  for (const child of children) yield* leavesFrom(child, edge);
}

/**
 * The FIRST or LAST visual line box of `root`'s content.
 *
 * Walks in from the leading/trailing LEAF rather than collapsing a range at the
 * root's content edge: a collapsed range whose boundary sits between block-level
 * children paints nothing in Chromium, so the old `contentEdgeRect` returned null
 * for EVERY block here and the reference silently became the editor's padded box
 * — off by the padding at the top and by the padding at the bottom, in opposite
 * directions. A leaf is a `<span>`'s text, a `<br>`, or a decorator's own DOM,
 * each of which occupies exactly one line and reports it.
 *
 * Walking INWARD (rather than climbing back up to the parent) is what keeps the
 * answer a line: an unmeasurable trailing leaf hands off to the leaf before it,
 * still on the same edge, whereas the parent's box spans every line at once.
 */
function edgeLineRect(root: HTMLElement, edge: "first" | "last"): DOMRect | null {
  for (const leaf of leavesFrom(root, edge)) {
    const rect = nodeLineRect(leaf, edge);
    if (rect) return rect;
  }
  return null;
}

/**
 * The line box the collapsed caret sits on, or null when the DOM cannot say.
 *
 * When the caret's own range paints nothing — an empty soft line, or the boundary
 * beside an inline decorator — the caret's line is BORROWED from the child node
 * at the anchor offset. That child is always on the caret's own line: the node
 * *at* the offset is what the caret sits immediately before (the `<br>` that ends
 * an empty line, the chip the caret sits in front of), and the node before it is
 * what the caret sits immediately after.
 */
function caretLineRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const direct = pickEdge(range.getClientRects(), "first");
  if (direct) return direct;

  const container = range.startContainer;
  if (container.nodeType !== Node.ELEMENT_NODE) return null;
  const children = container.childNodes;
  return (
    nodeLineRect(children[range.startOffset], "first") ??
    nodeLineRect(children[range.startOffset - 1], "last")
  );
}

/** Do two boxes sit on the same visual line? Vertical overlap — no epsilon needed. */
function sameLine(a: DOMRect, b: DOMRect): boolean {
  return a.top < b.bottom && a.bottom > b.top;
}

/**
 * Where the caret sits among `root`'s visual lines, or null when the caret has no
 * measurable line box at all (a genuinely empty block, or an unfocused editor).
 * Null is the honest answer — the caller substitutes the STRUCTURAL edges, which
 * for a block with no lines to speak of are the same thing.
 */
function measureVisualLines(
  root: HTMLElement,
): Pick<CaretContext, "onTopLine" | "onBottomLine" | "caretX"> | null {
  const caret = caretLineRect();
  if (!caret) return null;
  const first = edgeLineRect(root, "first");
  const last = edgeLineRect(root, "last");
  return {
    // An unmeasurable extent with a measurable caret means the caret IS the only
    // line there is to be on.
    onTopLine: first ? sameLine(caret, first) : true,
    onBottomLine: last ? sameLine(caret, last) : true,
    caretX: caret.left,
  };
}

/**
 * Measure the caret in `editor`. Returns null when there is no caret to measure:
 * no range selection, or an anchor the linear-offset model cannot resolve. Null
 * is the ONLY "I don't know" — the offset and the `atStart`/`atEnd` flags are
 * always derived from the same resolved number, never from a substituted default
 * that would make them contradict each other (an unresolved anchor used to read
 * as `offset: 0` AND `atStart: false`, so every structural keystroke silently
 * degraded to a passthrough).
 */
export function readCaretContext(editor: LexicalEditor): CaretContext | null {
  const structural = editor.getEditorState().read(():
    | { offset: number; collapsed: boolean; atStart: boolean; atEnd: boolean }
    | null => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return null;
    // One walk each for the offset and the total; derive start/end from them.
    const off = $linearCaretOffset();
    if (off === null) return null;
    const total = $paragraphsPlainLength();
    const collapsed = selection.isCollapsed();
    return {
      offset: off,
      collapsed,
      atStart: collapsed && off === 0,
      atEnd: collapsed && off === total,
    };
  });
  if (!structural) return null;

  const root = editor.getRootElement();
  const visual = root ? measureVisualLines(root) : null;
  if (visual) return { ...structural, ...visual };
  // No measurable caret line box (no root element, or a block with no painted
  // content). Fall back to the STRUCTURAL edges rather than to `true`/`true`:
  // "the caret is on the first visual line" is exactly "the caret is at the
  // start" once there is at most one line, and it is never a claim that the
  // caret is simultaneously on the first AND last line of a block that has
  // several.
  return {
    ...structural,
    onTopLine: structural.atStart,
    onBottomLine: structural.atEnd,
    caretX: root?.getBoundingClientRect().left ?? 0,
  };
}

// --- caret placement (target editor) ---------------------------------------

interface DomCaret {
  node: Node;
  offset: number;
}

/**
 * Lexical's `skip-scroll-into-view` update tag: suppresses the
 * `scrollIntoViewIfNeeded` that `updateDOMSelection` otherwise runs on every
 * collapsed-selection reconcile. Passed on the no-scroll path.
 */
const SKIP_SCROLL_TAG = "skip-scroll-into-view";

/**
 * Take DOM focus for a caret landing. A no-scroll landing focuses the ROOT
 * element with `preventScroll` (Lexical's `editor.focus()` has no such option —
 * it always lets the browser scroll focus into view); a scroll-wanted landing
 * keeps `editor.focus()`, today's behavior.
 */
function focusEditor(editor: LexicalEditor, scroll: boolean): void {
  if (scroll) editor.focus();
  else editor.getRootElement()?.focus({ preventScroll: true });
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
 *
 * `scroll` (default false) declares whether the landing follows the caret into
 * view: false focuses via `preventScroll` and tags the update `skip-scroll-into-
 * view`; true is today's scroll-on behavior.
 */
export function placeCaretAtOffset(
  editor: LexicalEditor,
  offset: number,
  scroll = false,
): void {
  focusEditor(editor, scroll);
  editor.update(() => $placeCaretAtOffset(offset), scroll ? undefined : { tag: SKIP_SCROLL_TAG });
}

/**
 * Inside an editor update: collapse the caret to the linear `offset` across the
 * block's paragraphs (the body of `placeCaretAtOffset`, delegating to the shared
 * leaf-walking primitive). Exposed so a caller already inside an `editor.update()`
 * can restore the caret without nesting an update.
 */
export function $placeCaretAtOffset(offset: number): void {
  $placeCaretAtLinearOffset(offset);
}

/**
 * Focus `editor` and collapse the caret to the very start or end of its content.
 * `scroll` (default false) declares whether the landing follows the caret into
 * view — see {@link placeCaretAtOffset}.
 */
export function placeCaretAtBoundary(
  editor: LexicalEditor,
  edge: "start" | "end",
  scroll = false,
): void {
  focusEditor(editor, scroll);
  editor.update(
    () => {
      const root = $getRoot();
      if (edge === "start") root.selectStart();
      else root.selectEnd();
    },
    scroll ? undefined : { tag: SKIP_SCROLL_TAG },
  );
}

/**
 * Translate a DOM hit-test result `(element, childOffset)` into the equivalent
 * child index inside the Lexical element `node`.
 *
 * The DOM offset names a child NODE, so the translation goes through that child:
 * resolve it back to its Lexical node and read its index. Falls back to the end
 * of the element when the offset points past the last child (a caret at the very
 * end of the line), and to 0 when nothing resolves.
 *
 * Must be called inside an `editor.update()` / `read()`.
 */
function $childIndexAtDomOffset(node: ElementNode, hit: DomCaret): number {
  const size = node.getChildrenSize();
  if (hit.node.nodeType !== Node.ELEMENT_NODE) return 0;
  const domChild = hit.node.childNodes[hit.offset];
  if (!domChild) return size;

  // The DOM child may be a DESCENDANT's element (an inner span of a decorator's
  // React tree), so climb to the direct child of `node`.
  let current: LexicalNode | null = $getNearestNodeFromDOMNode(domChild);
  while (current && current.getParent()?.getKey() !== node.getKey()) {
    current = current.getParent();
  }
  if (current) return current.getIndexWithinParent();

  // Nothing resolved: the DOM child carries no Lexical key of its own, which is
  // the case for a LineBreakNode's `<br>` — so `$getNearestNodeFromDOMNode`
  // answers the PARAGRAPH, whose climb terminates at the root and yields no
  // child. That is precisely the node an empty soft line is made of, so the
  // fallback matters: positionally, the DOM child list and the Lexical child
  // list are the same list (one DOM node per inline child), so the hit offset IS
  // the index.
  return Math.min(Math.max(hit.offset, 0), size);
}

/**
 * Focus `editor` and place the caret at viewport column `x` on its top or bottom
 * visual line — preserving the column when crossing blocks up/down. Falls back to
 * the block start/end when the point resolves outside the editor.
 *
 * `scroll` (default false) declares whether the landing follows the caret into
 * view — see {@link placeCaretAtOffset}. It is threaded through both boundary
 * fallbacks and the hit-test placement so EVERY selection-setting update on this
 * path honors the intent.
 */
export function placeCaretAtColumn(
  editor: LexicalEditor,
  x: number,
  edge: "top" | "bottom",
  scroll = false,
): void {
  const root = editor.getRootElement();
  if (!root) {
    placeCaretAtBoundary(editor, edge === "top" ? "start" : "end", scroll);
    return;
  }
  focusEditor(editor, scroll);

  const rootRect = root.getBoundingClientRect();
  // Aim at the CENTRE of the target line box, not at an offset from the editor's
  // padded box. A block whose last line is empty has its `<br>` line box well
  // above `rootRect.bottom`, so the old arithmetic aimed into the bottom padding:
  // the hit-test then resolved to the root element, `$getNearestNodeFromDOMNode`
  // answered the RootNode, and the "element anchor at offset 0" branch below
  // landed the caret at the very START of the block — which is why arrowing UP
  // into a multi-line block jumped to its first line instead of its last.
  const line = edgeLineRect(root, edge === "top" ? "first" : "last");
  const y = line
    ? (line.top + line.bottom) / 2
    : edge === "top"
      ? rootRect.top + 1
      : rootRect.bottom - 1;
  const clampedX = Math.min(Math.max(x, rootRect.left + 1), rootRect.right - 1);

  const hit = caretFromPoint(clampedX, y);
  if (!hit || !root.contains(hit.node)) {
    placeCaretAtBoundary(editor, edge === "top" ? "start" : "end", scroll);
    return;
  }

  editor.update(
    () => {
      const landAtBoundary = () => {
        const root2 = $getRoot();
        if (edge === "top") root2.selectStart();
        else root2.selectEnd();
      };
      const node = $getNearestNodeFromDOMNode(hit.node);
      if (!node) {
        landAtBoundary();
        return;
      }
      if ($isTextNode(node)) {
        const off = Math.min(hit.offset, node.getTextContentSize());
        const sel = $createRangeSelection();
        sel.anchor.set(node.getKey(), off, "text");
        sel.focus.set(node.getKey(), off, "text");
        $setSelection(sel);
        return;
      }
      // A DECORATOR hit — the point landed on a chip / inline formula / inline
      // page link. An element-typed selection point on a decorator is not a caret
      // position at all: Lexical has nowhere to paint it, so the caret would
      // simply vanish. Land beside the decorator instead, preferring the side the
      // point actually fell on.
      if ($isDecoratorNode(node)) {
        const hitRect = (hit.node.nodeType === Node.ELEMENT_NODE
          ? (hit.node as Element)
          : hit.node.parentElement
        )?.getBoundingClientRect();
        const after = !hitRect || clampedX > (hitRect.left + hitRect.right) / 2;
        const landed = after
          ? (node.selectNext(0, 0) ?? node.selectPrevious())
          : (node.selectPrevious() ?? node.selectNext(0, 0));
        if (!landed) landAtBoundary();
        return;
      }
      // The RootNode is not a landing site either: "element offset 0" on it is
      // the very start of the block, which for a `bottom` landing is the opposite
      // of what was asked for.
      if ($isRootNode(node) || !$isElementNode(node)) {
        // A non-element leaf (a `<br>`'s LineBreakNode) is not addressable as an
        // element point either — land beside it.
        const landed = $isRootNode(node)
          ? null
          : (node.selectNext(0, 0) ?? node.selectPrevious());
        if (!landed) landAtBoundary();
        return;
      }
      // An ELEMENT hit — the point fell between the paragraph's children rather
      // than inside a text run, which is what an EMPTY soft line is (the caret
      // position between two `<br>`s). The DOM offset is the whole answer here
      // and must be carried across: pinning the selection to element offset 0
      // landed every such hit at the block's FIRST line, which is why arrowing UP
      // into a block whose last line is empty jumped to its top. The DOM offset is
      // translated through the child it names rather than used as a Lexical index
      // directly — the two agree today, but only the mapping is guaranteed to.
      const sel = $createRangeSelection();
      const index = $childIndexAtDomOffset(node, hit);
      sel.anchor.set(node.getKey(), index, "element");
      sel.focus.set(node.getKey(), index, "element");
      $setSelection(sel);
    },
    scroll ? undefined : { tag: SKIP_SCROLL_TAG },
  );
}
