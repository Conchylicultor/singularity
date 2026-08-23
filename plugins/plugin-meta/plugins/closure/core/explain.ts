import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { inclusionPathWithin } from "./inclusion-path";
import { resolveComposition, expandEntrySeeds } from "./resolve-composition";
import type { CompositionManifest, EdgeGraph, InclusionPath } from "./types";

/**
 * Explain why `target` is in the composition's bundle: the shortest chain of
 * edges from a seed (an entry point, or a SELECTED soft contributor) to
 * `target`. `null` if `target` is not bundled.
 *
 * The public, manifest-shaped entry point: it resolves the composition and hands
 * the resolved parts to {@link inclusionPathWithin}, which owns the BFS. The
 * split exists because `resolveComposition` itself needs an explanation — its
 * `unsatisfiedExclusions` postcondition names the import chain that re-added an
 * excluded plugin — and a resolver calling this wrapper would be a cycle (and an
 * infinite one). Both callers reach the same BFS instead of a second copy of it.
 */
export function explainInclusion(
  graph: EdgeGraph,
  manifest: CompositionManifest,
  target: PluginId,
): InclusionPath | null {
  const comp = resolveComposition(graph, manifest);
  const { seeds } = expandEntrySeeds(manifest, graph);
  return inclusionPathWithin(
    graph,
    {
      bundle: comp.bundle,
      membership: comp.membership,
      entrySeeds: seeds,
      selectedContributors: manifest.selectedContributors,
    },
    target,
  );
}
