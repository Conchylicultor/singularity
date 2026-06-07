import {
  buildPluginTree,
  type PluginNode as TreePluginNode,
} from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPluginTree } from "../../core/endpoints";
import type { PluginNode, PluginTreePayload } from "../../core/types";

function toApiNode(node: TreePluginNode): PluginNode {
  return {
    path: node.path,
    name: node.name,
    hierarchyId: node.hierarchyId,
    description: node.description,
    loadBearing: node.loadBearing,
    collapsed: node.collapsed,
    runtimes: node.runtimes,
    children: node.children.map(toApiNode),
    facets: node.facets,
  };
}

function tally(
  node: PluginNode,
  totals: { plugins: number; loadBearing: number; umbrellas: number },
) {
  totals.plugins += 1;
  if (node.loadBearing) totals.loadBearing += 1;
  if (node.children.length > 0) totals.umbrellas += 1;
  for (const child of node.children) tally(child, totals);
}

export const handleTree = implement(getPluginTree, async () => {
  const tree = await buildPluginTree(PLUGINS_DIR, { skipBarrelImport: true });
  const plugins = tree.roots.map(toApiNode);

  const totals = { plugins: 0, loadBearing: 0, umbrellas: 0 };
  for (const p of plugins) tally(p, totals);

  const payload: PluginTreePayload = { plugins, totals };
  return payload;
});
