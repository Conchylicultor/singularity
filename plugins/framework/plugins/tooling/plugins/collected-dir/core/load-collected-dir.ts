// Generic loader for a "collected dir" registry — the build-time counterpart to
// the web/server contribution collection. Every collected runtime (facet, check,
// …) is discovered by codegen into a `<X>.generated.ts` exporting a
// `CollectedEntry[]`; this turns that entry list into validated, typed items.
//
// The caller passes the already-loaded `entries` array (not a module specifier):
// some generated registries must be imported through a non-literal specifier so
// the web bundler cannot statically follow them (see `facets/core/load-facets.ts`),
// and a relative specifier inside this leaf would resolve against the wrong module.
// This leaf has zero cross-plugin imports so `facets/core` and `checks/core` can
// both depend on it without forming an import cycle (`codegen/core`, where the
// `CollectedDir` marker lives, transitively depends on facets and so cannot).

export interface CollectedEntry {
  pluginPath: string;
  loader: () => Promise<{ default: unknown }>;
  dependsOn: string[];
}

export interface LoadCollectedDirOptions<T> {
  /** Type-guard validating each loaded default export (and each item of an array export). */
  isItem: (value: unknown) => value is T;
  /** Topo-sort entries by their `dependsOn` graph before loading (facets need this; checks don't). */
  ordered?: boolean;
  /** De-dupe loaded items by this key, keeping the first occurrence (checks de-dupe by id). */
  dedupeKey?: (item: T) => string;
  /** Label used in warn-on-reject log lines, e.g. "facet" / "check". */
  label?: string;
}

function topoSort(entries: CollectedEntry[]): CollectedEntry[] {
  const byPath = new Map(entries.map((e) => [e.pluginPath, e]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: CollectedEntry[] = [];
  function visit(path: string) {
    if (visited.has(path)) return;
    if (stack.has(path))
      throw new Error(`Collected-dir dependency cycle: ${[...stack, path].join(" → ")}`);
    stack.add(path);
    const entry = byPath.get(path);
    if (entry) for (const dep of entry.dependsOn) visit(dep);
    stack.delete(path);
    visited.add(path);
    if (entry) result.push(entry);
  }
  for (const e of entries) visit(e.pluginPath);
  return result;
}

export async function loadCollectedDir<T>(
  entries: CollectedEntry[],
  opts: LoadCollectedDirOptions<T>,
): Promise<T[]> {
  const ordered = opts.ordered ? topoSort(entries) : entries;
  const results = await Promise.allSettled(ordered.map((e) => e.loader()));
  const out: T[] = [];
  const seen = opts.dedupeKey ? new Set<string>() : null;
  const label = opts.label ?? "collected-dir";
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === "rejected") {
      console.warn(`[${label}] failed: ${ordered[i]!.pluginPath}`, r.reason);
      continue;
    }
    const exported = (r.value as { default?: unknown }).default;
    const items = Array.isArray(exported) ? exported : exported ? [exported] : [];
    for (const item of items) {
      if (!opts.isItem(item)) continue;
      if (seen && opts.dedupeKey) {
        const key = opts.dedupeKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(item);
    }
  }
  return out;
}
