import { buildPluginTree, type PluginNode as TreePluginNode } from "@plugins/packages/plugins/plugin-tree/shared";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";
import type { PluginNode, PluginTreePayload } from "../../shared/types";

function toApiNode(node: TreePluginNode): PluginNode {
  return {
    path: node.path,
    name: node.name,
    hierarchyId: node.hierarchyId,
    description: node.description,
    loadBearing: node.loadBearing,
    runtimes: node.runtimes,
    children: node.children.map(toApiNode),
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

export function handleTree(): Response {
  const tree = buildPluginTree(PLUGINS_DIR);
  const plugins = tree.roots.map(toApiNode);

  const totals = { plugins: 0, loadBearing: 0, umbrellas: 0 };
  for (const p of plugins) tally(p, totals);

  const payload: PluginTreePayload = { plugins, totals };
  return Response.json(payload);
}
