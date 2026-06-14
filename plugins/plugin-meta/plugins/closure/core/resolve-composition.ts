import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { classifyEdges } from "./classify-edges";
import type { Composition, CompositionManifest, EdgeGraph, MembershipState } from "./types";

/**
 * Transitive hard closure of a seed set over `hardForward`. The visited-set makes
 * it cycle- and self-edge-safe (a DAG is expected per the boundary rules; this is
 * defensive, not relied upon).
 */
export function hardClosure(seeds: Iterable<PluginId>, graph: EdgeGraph): Set<PluginId> {
  const out = new Set<PluginId>();
  const stack = [...seeds];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    for (const t of graph.hardForward.get(x) ?? []) {
      if (!out.has(t)) stack.push(t);
    }
  }
  return out;
}

/**
 * Expand declared entry points to the actual seed set: each entry plus its whole
 * subtree (containment). A no-runtime umbrella entry contributes nothing on its
 * own, so its sub-plugins are seeded here. Unknown ids (no `subtree` entry) pass
 * through inertly.
 */
export function expandEntrySeeds(entryPoints: Iterable<PluginId>, graph: EdgeGraph): Set<PluginId> {
  const seeds = new Set<PluginId>();
  for (const id of entryPoints) {
    seeds.add(id);
    for (const d of graph.subtree.get(id) ?? []) seeds.add(d);
  }
  return seeds;
}

export function resolveComposition(graph: EdgeGraph, manifest: CompositionManifest): Composition;
export function resolveComposition(tree: PluginTree, manifest: CompositionManifest): Composition;
export function resolveComposition(
  graphOrTree: EdgeGraph | PluginTree,
  manifest: CompositionManifest,
): Composition {
  const graph = isTree(graphOrTree) ? classifyEdges(graphOrTree) : graphOrTree;

  // Entry seeds = the declared entries ∪ their subtrees. Selecting an umbrella app
  // as an entry ships its whole subtree (a no-runtime umbrella has no imports of its
  // own, so its runtime-bearing sub-plugins must be seeded explicitly).
  const entrySeeds = expandEntrySeeds(manifest.entryPoints, graph);

  // `required` = hard closure of the entry seeds ALONE — the locked set, unchanged.
  const required = hardClosure(entrySeeds, graph);

  // Conservative, single-pass bundle: NO fixpoint, NO auto-activation. The bundle is
  // exactly the hard closure of (entry seeds ∪ the explicitly selected contributors).
  const bundle = hardClosure([...entrySeeds, ...manifest.selectedContributors], graph);

  // `available` = the reviewable option frontier: ids NOT in the bundle that
  // soft-contribute to some bundled member. Use softReverse over the bundle, minus
  // the bundle itself. Sorted + deduped.
  const availableSet = new Set<PluginId>();
  for (const id of bundle) {
    for (const c of graph.softReverse.get(id) ?? []) {
      if (!bundle.has(c)) availableSet.add(c);
    }
  }
  const available = [...availableSet].sort();

  // Classification (precedence for in-bundle nodes: entry > required > contributor >
  // via-contributor). The `contributor` set is the selected contributors that landed
  // in the bundle (not already entry/required). `available` is assigned only to
  // out-of-bundle nodes in the available set; everything else defaults to `excluded`.
  const entrySet = new Set(manifest.entryPoints);
  const selectedSet = new Set(manifest.selectedContributors);
  const membership = new Map<PluginId, MembershipState>();
  for (const id of allNodeIds(graph)) membership.set(id, "excluded");
  for (const id of availableSet) membership.set(id, "available");
  for (const id of bundle) {
    membership.set(
      id,
      entrySet.has(id)
        ? "entry"
        : required.has(id)
          ? "required"
          : selectedSet.has(id)
            ? "contributor"
            : "via-contributor",
    );
  }

  // Selections already locked in by hard edges (entry/required) — a no-op selection.
  const redundantSelections = manifest.selectedContributors.filter(
    (x) => required.has(x) || entrySet.has(x),
  );

  return { bundle, membership, available, redundantSelections };
}

function isTree(x: EdgeGraph | PluginTree): x is PluginTree {
  return (x as PluginTree).byDir instanceof Map;
}

/** Every node id is a key of the four adjacency maps (classifyEdges seeds them all). */
function allNodeIds(graph: EdgeGraph): Iterable<PluginId> {
  return graph.hardForward.keys();
}
