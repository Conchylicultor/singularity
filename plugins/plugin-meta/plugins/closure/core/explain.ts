import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { resolveComposition, expandEntrySeeds } from "./resolve-composition";
import type { CompositionManifest, EdgeGraph, InclusionPath, InclusionStep } from "./types";

/**
 * Explain why `target` is in the composition's bundle: the shortest chain of edges
 * from a seed (an entry point, or a SELECTED soft contributor) to `target`.
 *
 * Returns `null` if `target` is not bundled. Otherwise BFS over `hardReverse` from
 * `target` back toward the seed frontier (expanded entries ∪ selected contributors),
 * stopping at the first reached seed (shortest by BFS layering). Entry-origin seeds
 * win ties — both because BFS prefers them when discovered first and because we
 * re-scan to favour an entry path when one exists, matching membership precedence.
 * When the seed is a selected contributor, the leading soft edge `contributor →
 * owner` is prepended so the path reads "C soft-contributes to its owned slot, then
 * C's hard imports pull … → target".
 */
export function explainInclusion(
  graph: EdgeGraph,
  manifest: CompositionManifest,
  target: PluginId,
): InclusionPath | null {
  const comp = resolveComposition(graph, manifest);
  if (!comp.bundle.has(target)) return null;
  const state = comp.membership.get(target) ?? "excluded";

  // The entry frontier is the expanded seeds (entries ∪ their subtrees): a
  // no-runtime umbrella entry has no hard imports of its own, so the hard chain to
  // `target` actually originates at a runtime-bearing sub-plugin of the entry.
  const entrySet = expandEntrySeeds(manifest.entryPoints, graph);
  // Contributor origins = the explicitly selected contributors that are bundled.
  const activeSet = new Set<PluginId>();
  for (const a of manifest.selectedContributors) {
    if (comp.bundle.has(a)) activeSet.add(a);
  }

  // BFS over hardReverse from target; predecessor[x] = the node x hard-imports
  // (i.e. the next hop toward target along forward hard edges).
  const predecessor = new Map<PluginId, PluginId>();
  const visited = new Set<PluginId>([target]);
  const queue: PluginId[] = [target];

  const buildPath = (seed: PluginId): InclusionPath => {
    // Reconstruct forward hard steps seed → … → target.
    const steps: InclusionStep[] = [];
    let cur = seed;
    while (cur !== target) {
      const next = predecessor.get(cur)!;
      steps.push({ from: cur, to: next, kind: "hard" });
      cur = next;
    }
    const originIsEntry = entrySet.has(seed);
    if (originIsEntry) {
      return { target, state, origin: seed, originKind: "entry", steps };
    }
    // Active contributor seed: prepend its soft edge to a bundled owned slot.
    const owner = (graph.softForward.get(seed) ?? []).find((b) => comp.bundle.has(b));
    const softStep: InclusionStep[] = owner ? [{ from: seed, to: owner, kind: "soft" }] : [];
    return { target, state, origin: seed, originKind: "contributor", steps: [...softStep, ...steps] };
  };

  // First pass: prefer an entry-origin path. Collect contributor seeds for fallback.
  let contributorSeed: PluginId | null = null;
  while (queue.length) {
    const x = queue.shift()!;
    if (entrySet.has(x)) return buildPath(x);
    if (contributorSeed === null && activeSet.has(x)) contributorSeed = x;
    for (const p of graph.hardReverse.get(x) ?? []) {
      if (visited.has(p)) continue;
      visited.add(p);
      predecessor.set(p, x);
      queue.push(p);
    }
  }

  // No entry path; fall back to the shortest contributor-origin path found.
  if (contributorSeed !== null) return buildPath(contributorSeed);
  return null;
}
