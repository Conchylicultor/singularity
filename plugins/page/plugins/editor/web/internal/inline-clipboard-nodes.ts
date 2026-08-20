import {
  $createLineBreakNode,
  $isDecoratorNode,
  $isElementNode,
  type LexicalNode,
} from "lexical";

/**
 * Whether `node` would make Lexical treat a clipboard insert as a BLOCK insert.
 *
 * The predicate is `RangeSelection.insertNodes`' own: given any non-inline
 * element or decorator it stops splicing inline content and splits the current
 * paragraph instead. Stated here so the block editor's guard tests exactly what
 * it is guarding against, rather than a look-alike.
 */
export function isBlockLevel(node: LexicalNode): boolean {
  return ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();
}

/**
 * What a clipboard payload amounts to once a block's editor has flattened it —
 * three outcomes that need three different decisions, so they are three arms
 * rather than a list that could be empty for two unrelated reasons.
 *
 * - `inline` — content to splice in. Non-empty by construction (the tuple type
 *   is what stops it being conflated with `empty`).
 * - `empty` — the payload was block structure carrying no content at all
 *   (`<p></p>`), so it inserts nothing. NOT the same as a refusal: a paste of
 *   nothing over a selection still REPLACES that selection, which is what the
 *   native paste does and what the caller must still do.
 * - `not-inline` — no inline form of this payload exists; the caller declines
 *   and leaves Lexical's own insert to run.
 */
export type InlineClipboardContent =
  | { kind: "inline"; nodes: [LexicalNode, ...LexicalNode[]] }
  | { kind: "empty" }
  | { kind: "not-inline" };

/**
 * Flatten clipboard-generated nodes to the inline content of ONE paragraph.
 *
 * A block in this editor **is** one paragraph — its own row in `page_blocks`,
 * its own content doc, its own Lexical editor with a single-element root. So
 * block structure arriving through a per-block paste is a category error: the
 * structural clipboard path (`BlockForestPastePlugin`) has already had its turn
 * and declined, which means the payload was classified as ONE line's worth of
 * content. Whatever markup carried it, it belongs inside the block.
 *
 * Element boundaries are not thrown away — each one that separates content from
 * content becomes a soft break (`LineBreakNode`), which is what a line boundary
 * inside a block already is here (Shift+Enter). The break is emitted **lazily**,
 * when a boundary turns out to have content on both sides, so it is a boundary
 * rule rather than a leading-edge one: `<p>a</p>tail` breaks between them, and
 * an empty leading or trailing block leaves no stray break behind. Nothing is
 * dropped and nothing is minted.
 *
 * `not-inline` is the answer for a non-inline DECORATOR: it owns no children to
 * unwrap, so there is no inline form of it, and silently discarding it would be
 * losing the user's content. The caller declines instead and Lexical's own
 * insert runs exactly as before — loud and unchanged, rather than lossy. (No
 * block-text node registers such a decorator today; the arm exists so adding one
 * is a visible behaviour, not a silent deletion.)
 */
export function $flattenToInline(
  nodes: readonly LexicalNode[],
): InlineClipboardContent {
  const out: LexicalNode[] = [];
  // A block boundary has been crossed and is waiting to see whether anything
  // follows it. Only then is it worth a break.
  let boundaryPending = false;

  const emit = (node: LexicalNode): void => {
    if (boundaryPending && out.length > 0) out.push($createLineBreakNode());
    boundaryPending = false;
    out.push(node);
  };

  const visit = (node: LexicalNode): boolean => {
    if (!isBlockLevel(node)) {
      // Inline already: a text node, a line break, an inline decorator, or an
      // inline element (a link) — which keeps its children, marks and all.
      emit(node);
      return true;
    }
    // A non-element block is a decorator: nothing to unwrap, so the whole
    // payload has no inline form. Bail immediately rather than mint nodes the
    // caller is about to discard.
    if (!$isElementNode(node)) return false;
    boundaryPending = true;
    for (const child of node.getChildren()) if (!visit(child)) return false;
    boundaryPending = true;
    return true;
  };

  for (const node of nodes) if (!visit(node)) return { kind: "not-inline" };
  const [first, ...rest] = out;
  return first === undefined
    ? { kind: "empty" }
    : { kind: "inline", nodes: [first, ...rest] };
}
