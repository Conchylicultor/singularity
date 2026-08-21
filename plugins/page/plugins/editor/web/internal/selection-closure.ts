/**
 * One rendered row of the block list, as the range machinery needs it: an id and
 * the nesting depth it is drawn at, in document (depth-first) order — the shape
 * `flattenVisible` already produces. Depth rather than `parentId` on purpose:
 * what a selection may cover is what the user can SEE, and the flatten is the
 * only place that knows it (a collapsed container's hidden children are not rows
 * at all, and its borrowed line is one).
 */
export interface VisibleBlock {
  readonly id: string;
  readonly depth: number;
}

/** A selection range: where the user started, and where they are now. */
export interface BlockRange {
  readonly anchor: string;
  readonly head: string;
}

/**
 * The same range, with the descendants of every block in it included.
 *
 * A block's children travel with it — deleting, duplicating, copying, dragging
 * and indenting all act on the selection's subtree ROOTS, and a root carries its
 * subtree — so a selection that shows a parent without its children is showing
 * the user something other than what the next keystroke will do. Closing the
 * range is what makes the two agree.
 *
 * ## Why the result is still a contiguous range
 *
 * In a depth-first flatten a block's descendants are exactly the rows that
 * follow it while the depth stays greater than its own, so a range's
 * descendants are a run of rows directly AFTER its bottom end. The closure
 * therefore only ever pushes that bottom end further down — never splits the
 * range, never reaches above it (selecting a child does not select its parent)
 * — and "the selection" stays one `[anchor, head]` pair the whole way through.
 *
 * The bottom end is whichever of the two the user dragged to last, so an upward
 * range (head above anchor) grows at its ANCHOR. That is the one place the
 * anchor moves under the user, and it is the honest answer: the anchor is an end
 * of the selection, and the selection now ends lower.
 *
 * A range naming an id this list does not carry has no descendants anyone can
 * see, so it comes back exactly as it went in.
 */
export function rangeWithDescendants(
  visible: readonly VisibleBlock[],
  range: BlockRange,
): BlockRange {
  const anchorIdx = visible.findIndex((v) => v.id === range.anchor);
  const headIdx = visible.findIndex((v) => v.id === range.head);
  if (anchorIdx === -1 || headIdx === -1) return range;

  const lo = Math.min(anchorIdx, headIdx);
  let hi = Math.max(anchorIdx, headIdx);

  // The shallowest block in the range is the one whose subtree reaches furthest:
  // every row below the range that is deeper than it hangs off something inside
  // the range, and the first row that is not ends every subtree the range opened.
  let outerDepth = visible[lo]!.depth;
  for (let i = lo + 1; i <= hi; i++) {
    outerDepth = Math.min(outerDepth, visible[i]!.depth);
  }
  while (hi + 1 < visible.length && visible[hi + 1]!.depth > outerDepth) hi++;

  const bottom = visible[hi]!.id;
  return headIdx >= anchorIdx
    ? { anchor: range.anchor, head: bottom }
    : { anchor: bottom, head: range.head };
}
