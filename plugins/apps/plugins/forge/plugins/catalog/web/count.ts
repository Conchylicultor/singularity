import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

export function countFlat<T>(plugins: PluginNode[], extract: (p: PluginNode) => T[]): number {
  let n = 0;
  function visit(node: PluginNode) {
    n += extract(node).length;
    for (const child of node.children) visit(child);
  }
  for (const p of plugins) visit(p);
  return n;
}
