import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { CompositionManifest, EntryPattern } from "./types";

/**
 * Resolve a manifest's `extends` chain into a single flat manifest. The result's
 * `entryPoints` + `selectedContributors` are the UNION of this manifest's own and
 * every transitively-extended composition's, deduped and with `extends` cleared
 * (`[]`). Everything the engine consumes (`resolveComposition`, the causality
 * queries, the `composition-closure` check) operates on a flattened manifest, so
 * `extends` is a pure pre-resolution rewrite — never a special case downstream.
 *
 * Conservative + total, mirroring the rest of the engine:
 * - **Diamond/cycle-safe** — a `visited` set over composition NAMES means each
 *   composition is folded in at most once, so `a extends b`, `b extends a`, or two
 *   paths to the same pack all terminate and union cleanly.
 * - **Unknown names pass inertly** — an `extends` entry with no matching manifest
 *   in `registry` contributes nothing (exactly like an unknown plugin id in
 *   `entryPoints` flows inertly through `expandEntrySeeds`). Whether the name
 *   resolves is the `composition-closure` check's job, not resolution's.
 *
 * `name` and any other fields are carried from the root manifest unchanged.
 */
export function flattenManifest(
  manifest: CompositionManifest,
  registry: Iterable<CompositionManifest>,
): CompositionManifest {
  const byName = new Map<string, CompositionManifest>();
  for (const m of registry) byName.set(m.name, m);

  const entryPoints = new Set<EntryPattern>();
  const selectedContributors = new Set<PluginId>();
  const visited = new Set<string>();

  const visit = (m: CompositionManifest): void => {
    if (visited.has(m.name)) return;
    visited.add(m.name);
    for (const e of m.entryPoints) entryPoints.add(e);
    for (const c of m.selectedContributors) selectedContributors.add(c);
    for (const name of m.extends ?? []) {
      const ext = byName.get(name);
      if (ext) visit(ext);
    }
  };
  visit(manifest);

  return {
    ...manifest,
    entryPoints: [...entryPoints],
    selectedContributors: [...selectedContributors],
    extends: [],
  };
}
