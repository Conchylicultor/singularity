/**
 * Topo-sort plugins by `dependsOn`. Throws on a cycle. Preserves input order
 * among plugins with no inter-dependency. Generic over the loaded-plugin shape
 * (mirrors the server/central copies); the `id` it keys on is the unique,
 * loader-derived hierarchy path, so the `visited` set never conflates two
 * distinct plugins.
 */
export function topoSortPlugins<T extends { id: string; dependsOn?: T[] }>(
  plugins: T[],
): T[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: T[] = [];
  const visit = (p: T, path: string[]): void => {
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
