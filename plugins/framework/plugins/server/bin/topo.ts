/**
 * Topo-sort a plugin list by `dependsOn`. Throws on a cycle with the path.
 * Preserves input order among plugins with no inter-dependency.
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
      throw new Error(
        `[plugin] init cycle: ${[...path, p.id].join(" → ")}`,
      );
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
