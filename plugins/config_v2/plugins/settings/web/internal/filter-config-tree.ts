import type { ConfigRegistration } from "@plugins/config_v2/web";
import type { ConfigTreeNode } from "./prune-config-tree";

/**
 * Filter the pruned config tree by a search query while keeping its hierarchy.
 *
 * Two match modes combine:
 * - **Plugin/app name match.** When a node's own name contains the query, the
 *   entire subtree below it is kept unchanged — typing an app or plugin name
 *   surfaces every config item under it, not just the node itself.
 * - **Registration match.** Otherwise a node is kept only for the registrations
 *   that match `matchReg` plus any descendant branch that survives filtering;
 *   ancestors of a deep match are retained so the path stays visible.
 *
 * An empty query returns the tree untouched.
 */
export function filterConfigTree(
  nodes: ConfigTreeNode[],
  query: string,
  matchReg: (r: ConfigRegistration) => boolean,
): ConfigTreeNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;

  const out: ConfigTreeNode[] = [];
  for (const item of nodes) {
    // Plugin/app name match → reveal the whole subtree, all child items included.
    if (item.node.name.toLowerCase().includes(needle)) {
      out.push(item);
      continue;
    }
    const children = filterConfigTree(item.children, query, matchReg);
    const registrations = item.registrations.filter(matchReg);
    if (registrations.length > 0 || children.length > 0) {
      out.push({ ...item, registrations, children });
    }
  }
  return out;
}
