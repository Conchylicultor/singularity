import { visibleChildRule, type Block } from "../../core";
import type { TreeNode } from "@plugins/primitives/plugins/tree/core";
import type { FlatBlock } from "./block-frames";

/**
 * Depth-first flatten that carries each block's depth. Rendering the tree as a
 * flat list of keyed siblings (rather than nesting children inside their parent's
 * DOM) keeps every block in the same React parent, so indent/outdent/move only
 * reorder keyed elements — the Lexical editor instance (and its focus) survives.
 *
 * Visibility is `visibleChildRule` — the SAME rule the reducer's
 * `visibleChildrenOf` runs, so the surface and the ladders can never disagree
 * about what a collapsed container shows. The rule is stated once in `core`;
 * this walks the already-built `TreeNode` forest so a render costs no per-node
 * `childrenOf` scan, and `flatten-blocks.test.ts` cross-checks the two encodings
 * against each other over the fuzz forest.
 *
 * `sealed` is the rule's own carry: it marks the rows inside a collapsed
 * container's borrowed chain, where only that one borrowed line renders.
 */
export function flattenVisible(
  nodes: TreeNode<Block>[],
  anchorTypes: ReadonlySet<string>,
  depth = 0,
  out: FlatBlock[] = [],
  sealed = false,
): FlatBlock[] {
  // `ordinal` is the 1-based position within the maximal run of consecutive
  // same-type siblings (resets on type change). Each recursive call into a
  // node's children starts a fresh counter, so numbering resets per level.
  let ordinal = 0;
  let prevType: string | null = null;
  for (const node of nodes) {
    ordinal = node.type === prevType ? ordinal + 1 : 1;
    prevType = node.type;
    const { show, sealedBelow } = visibleChildRule({
      isAnchor: anchorTypes.has(node.type),
      expanded: node.expanded,
      sealed,
      hasChildren: node.children.length > 0,
    });
    const kids =
      show === "all" ? node.children : show === "first" ? node.children.slice(0, 1) : [];
    out.push({
      block: node,
      depth,
      childCount: node.children.length,
      ordinal,
      firstVisibleChildType: kids[0]?.type ?? null,
    });
    if (kids.length > 0) flattenVisible(kids, anchorTypes, depth + 1, out, sealedBelow);
  }
  return out;
}
