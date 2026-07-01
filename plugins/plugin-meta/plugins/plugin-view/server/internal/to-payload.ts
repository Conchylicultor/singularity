import {
  type PluginTree,
  type PluginNode as TreePluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { PluginNode, PluginTreePayload } from "../../core/types";

function tally(
  node: PluginNode,
  totals: { plugins: number; loadBearing: number; umbrellas: number },
) {
  totals.plugins += 1;
  if (node.loadBearing) totals.loadBearing += 1;
  if (node.children.length > 0) totals.umbrellas += 1;
  for (const child of node.children) tally(child, totals);
}

// Structure fields are always present; `facets` is populated only on the faceted
// build (empty `{}` on the structure-only tree). The disabled *cascade* is no
// longer on the payload — the client derives it from the composition edge graph —
// so only the plugin's own seed flag (`node.disabled`) ships, as `disabledSeed`.
function toApiNode(node: TreePluginNode): PluginNode {
  return {
    path: node.path,
    name: node.name,
    id: node.id,
    description: node.description,
    loadBearing: node.loadBearing,
    disabledSeed: node.disabled,
    collapsed: node.collapsed,
    runtimes: node.runtimes,
    children: node.children.map(toApiNode),
    facets: node.facets,
  };
}

export function treeToPayload(tree: PluginTree): PluginTreePayload {
  const plugins = tree.roots.map(toApiNode);
  const totals = { plugins: 0, loadBearing: 0, umbrellas: 0 };
  for (const p of plugins) tally(p, totals);
  return { plugins, totals };
}
