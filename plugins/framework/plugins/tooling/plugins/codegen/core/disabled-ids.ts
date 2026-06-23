import { classifyEdges, disabledClosure } from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

/**
 * The CLOSED set of disabled plugin ids: every plugin whose package.json sets
 * `singularity.disabled === true` (the seeds), plus the dependent-closure
 * cascade — descendants of a seed and every transitive importer of a disabled
 * plugin (`subtree` ∪ `hardReverse`, via {@link disabledClosure}).
 *
 * Deterministic from committed source (the seed flags live in package.json and
 * `classifyEdges` runs on the barrel-free tree), so applying this filter
 * unconditionally in codegen keeps the `*-in-sync` checks green: both the build
 * emission and the check re-render read the same committed flags.
 */
export function computeDisabledIds(tree: PluginTree): Set<PluginId> {
  const graph = classifyEdges(tree);
  const seeds = [...tree.byDir.values()].filter((n) => n.disabled).map((n) => n.id);
  return disabledClosure(seeds, graph);
}
