import type { Block } from "../../core";

/** One entry of the editor's depth-first flatten (see `flatten-blocks.ts`). */
export interface FlatBlock {
  block: Block;
  depth: number;
  /**
   * How many children the block has in the FOREST — not how many are visible.
   * Drives the collapse chevron (is there anything to fold?), which is a question
   * about the document, not about what is currently on screen: a collapsed
   * container has hidden children and must still offer the way back.
   */
  childCount: number;
  ordinal: number;
  /**
   * The `type` of this block's FIRST VISIBLE child (the immediately-following
   * flat entry), or `null` when it has none — collapsed, or genuinely childless.
   *
   * The flatten is the only place this is knowable without re-walking the
   * forest, and a container ANCHOR needs it: having no line of its own, it
   * cannot derive `--gutter-first-line-center` from its own handle, so it
   * borrows the first visible child's (see `BlockHandle.gutterFirstLineCenter`).
   * It doubles as the "has visible children" predicate that decides whether the
   * anchor row collapses to zero height or falls back to a one-line box.
   */
  firstVisibleChildType: string | null;
}

/**
 * A container block's frame: the row range its decorated box must cover,
 * as INDICES into the flat list (`start` = the container's own row,
 * `end` = its last visible descendant, inclusive).
 */
export interface FrameSpan {
  block: Block;
  depth: number;
  start: number;
  end: number;
}

/**
 * Compute the row span each container block's frame must cover.
 *
 * ## Why a span and not a wrapper
 *
 * The obvious implementation — group the container's rows and wrap them in a
 * box — is wrong here, and the editor is unusually sensitive to why. The forest
 * renders as a FLAT list of sibling rows precisely so a structural move only
 * reorders keyed elements within one parent, which is what lets each block's
 * Lexical instance (and its caret) survive an indent/outdent. A wrapper breaks
 * exactly that: Tab-ing a block across a frame boundary changes its DOM PARENT,
 * so React unmounts and remounts it, and the caret is lost. Verified, not
 * theorised — `e2e/indent-caret-verify.ts` shows a plain indent holding the
 * caret at its offset, while a wrapper-based frame dropped it out of the block
 * entirely.
 *
 * So the frame is never an ancestor of the rows. It is a SIBLING decoration
 * placed over the same CSS grid, spanning `start..end` by grid line number.
 * Rows keep one DOM parent for their whole life, the flat-list guarantee is
 * untouched, and no measurement or ResizeObserver is involved — the span is
 * derived from the flatten, which is already the source of truth for order.
 *
 * The spans are well-defined because the input is a depth-first flatten: a
 * block's visible descendants are exactly the CONTIGUOUS run of following
 * entries with a greater `depth`. A collapsed container has no such run and
 * still gets a frame over its own row alone (the box must not blink out when
 * you collapse it). Containers nest, so spans may nest; they never partially
 * overlap.
 */
export function computeFrameSpans(
  flat: readonly FlatBlock[],
  framedTypes: ReadonlySet<string>,
): FrameSpan[] {
  if (framedTypes.size === 0) return [];
  const spans: FrameSpan[] = [];
  for (let i = 0; i < flat.length; i += 1) {
    const item = flat[i]!;
    if (!framedTypes.has(item.block.type)) continue;
    let end = i;
    while (end + 1 < flat.length && flat[end + 1]!.depth > item.depth) end += 1;
    spans.push({ block: item.block, depth: item.depth, start: i, end });
  }
  return spans;
}
