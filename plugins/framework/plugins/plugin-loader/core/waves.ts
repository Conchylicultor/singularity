/**
 * Group entries into topological *load* waves over `dependsOn` (pluginPath
 * edges, the codegen-derived cross-plugin import graph in `server.generated.ts`).
 * Wave 0 = entries with no in-graph deps; every entry in wave N depends only on
 * entries in earlier waves, so a caller may import a whole wave concurrently and
 * an entry is never imported before every entry it imports from has finished.
 *
 * Why waves exist (the load-order invariant): a plugin's imports must be fully
 * evaluated before the plugin itself is imported. Importing a barrel and a
 * module that imports it concurrently lets the dependent evaluate while the
 * barrel is suspended mid-re-export at an async boundary, observing the barrel's
 * not-yet-initialized `const` exports as a TDZ `ReferenceError` (Bun 1.3.x).
 * Serializing only the cross-plugin edges (not the whole load) closes that race
 * while preserving intra-wave concurrency.
 *
 * `dependsOn` entries naming a pluginPath NOT present here (a web-only or
 * central-only plugin) are ignored rather than deadlocked on — they can't be
 * loaded on this runtime. A genuine cycle throws with the cycle path (mirrors
 * `topoSortPlugins`); we must NOT silently fall back to flat concurrent loading,
 * which is exactly the race above.
 */
export function computeLoadWaves<T extends { pluginPath: string; dependsOn: string[] }>(
  entries: T[],
): T[][] {
  const byPath = new Map(entries.map((e) => [e.pluginPath, e] as const));
  const depsOf = (e: T): string[] => e.dependsOn.filter((d) => byPath.has(d));

  // waveOf memoizes the resolved wave index; `stack` catches back-edges (cycles)
  // exactly as topoSortPlugins does, but keyed on pluginPath over the string edge
  // list instead of resolved plugin refs (plugins aren't loaded yet here).
  const waveOf = new Map<string, number>();
  const stack = new Set<string>();
  const visit = (e: T, trail: string[]): number => {
    const cached = waveOf.get(e.pluginPath);
    if (cached !== undefined) return cached;
    if (stack.has(e.pluginPath)) {
      throw new Error(`[plugin] load cycle: ${[...trail, e.pluginPath].join(" → ")}`);
    }
    stack.add(e.pluginPath);
    let w = 0;
    for (const d of depsOf(e)) w = Math.max(w, visit(byPath.get(d)!, [...trail, e.pluginPath]) + 1);
    stack.delete(e.pluginPath);
    waveOf.set(e.pluginPath, w);
    return w;
  };

  let maxWave = 0;
  for (const e of entries) maxWave = Math.max(maxWave, visit(e, []));
  const waves: T[][] = Array.from({ length: entries.length === 0 ? 0 : maxWave + 1 }, () => []);
  for (const e of entries) waves[waveOf.get(e.pluginPath)!]!.push(e);
  return waves;
}
