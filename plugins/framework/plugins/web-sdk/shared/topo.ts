import type { PluginDefinition } from "../core/types";

/**
 * Topo-sort plugins by `dependsOn`. Throws on a cycle. Preserves input order
 * among plugins with no inter-dependency.
 */
export function topoSortPlugins(plugins: PluginDefinition[]): PluginDefinition[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: PluginDefinition[] = [];
  const visit = (p: PluginDefinition, path: string[]): void => {
    if (visited.has(p.id)) return;
    if (stack.has(p.id)) {
      throw new Error(`[plugin] init cycle: ${[...path, p.id].join(" → ")}`);
    }
    stack.add(p.id);
    for (const dep of p.dependsOn ?? []) visit(dep, [...path, p.id]);
    stack.delete(p.id);
    visited.add(p.id);
    result.push(p);
  };
  for (const p of plugins) visit(p, []);
  return result;
}
