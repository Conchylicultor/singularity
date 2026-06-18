import { Rank } from "@plugins/primitives/plugins/rank/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

/**
 * A flat row for the DataView tree. The explorer is a *hierarchy* (the canonical
 * plugin tree), but the DataView tree view speaks flat rows +
 * `getParentId`/`getRank`, so we flatten the nested `PluginNode[]` into this
 * shape and let the tree primitive rebuild it.
 *
 * The row spreads the original `PluginNode` — crucially keeping its `.children`
 * array intact. The tree's internal `buildTree` rebuilds the visible hierarchy
 * from `parentId`/`rank`, but the badge components (child-count, expand-collapse,
 * membership) read the original `node.children`, so they still see the full
 * subtree.
 */
export type ExplorerRow = PluginNode & {
  parentId: string | null;
  rank: Rank;
  /**
   * Search text folded into the tree's subtree-preserving filter: every ancestor
   * name + this node's name + path + description. Including ancestor names
   * reproduces the old "type a plugin/app name to reveal its whole subtree"
   * behavior — every descendant row matches the name.
   */
  searchText: string;
};

/** Recursive count of all descendants of a node. */
export function countDescendants(node: PluginNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

/**
 * Flatten the nested plugin tree into DataView rows in DFS order, assigning each
 * sibling group an ascending fractional rank. Each row keeps its original
 * `.children` array (spread `...node`) so the badges see the full subtree, while
 * the tree primitive rebuilds the visible hierarchy from `parentId`/`rank`.
 */
export function flattenPluginTree(plugins: PluginNode[]): ExplorerRow[] {
  const out: ExplorerRow[] = [];
  // Last-assigned rank per parent (null parent = root), so each emitted sibling
  // gets the next ascending fractional key in the order we visit them.
  const ROOT = " root";
  const lastRank = new Map<string, Rank>();
  const nextRank = (parentId: string | null): Rank => {
    const key = parentId ?? ROOT;
    const rank = Rank.between(lastRank.get(key) ?? null, null);
    lastRank.set(key, rank);
    return rank;
  };

  const walk = (
    nodes: PluginNode[],
    parentId: string | null,
    ancestorText: string,
  ): void => {
    for (const node of nodes) {
      const nodeText = `${ancestorText} ${node.name}`.trim();
      out.push({
        ...node,
        parentId,
        rank: nextRank(parentId),
        searchText:
          `${nodeText} ${node.path} ${node.description ?? ""}`.trim(),
      });
      walk(node.children, node.id, nodeText);
    }
  };

  walk(plugins, null, "");
  return out;
}
