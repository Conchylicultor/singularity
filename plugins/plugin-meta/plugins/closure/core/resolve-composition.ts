import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { classifyEdges } from "./classify-edges";
import { matchEntryPattern, parseEntryPattern, type EntryPattern } from "./entry-pattern";
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
 * Transitive disabled closure of a seed set over the REVERSE + subtree directions.
 * Disabling a plugin must also disable everything that would break without it:
 * its DESCENDANTS (`subtree` — a child makes no sense without its parent) and its
 * transitive IMPORTERS (`hardReverse` — they crash at module-eval when the imported
 * barrel is gone). This is the mirror of {@link hardClosure}, which walks
 * `hardForward` (what a plugin needs); here we walk the opposite direction (who
 * needs this plugin). The visited-set makes it cycle- and self-edge-safe.
 */
export function disabledClosure(seeds: Iterable<PluginId>, graph: EdgeGraph): Set<PluginId> {
  const out = new Set<PluginId>();
  const stack = [...seeds];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    for (const d of graph.subtree.get(x) ?? []) if (!out.has(d)) stack.push(d); // descendants
    for (const r of graph.hardReverse.get(x) ?? []) if (!out.has(r)) stack.push(r); // importers
  }
  return out;
}

/**
 * Expand declared entry patterns into the actual seed set under the glob grammar
 * (see {@link parseEntryPattern}). "Entry a node" means *that node alone* — its
 * hard dependencies are added later by {@link hardClosure}, never seeded here.
 * A whole subtree is opt-in via a trailing `.**`; a leading `!` trims ids.
 *
 * Two passes:
 *  1. Positives (`!negate`): the exact `base` of every positive goes into `named`
 *     (the set that classifies as `entry` and drives `redundantSelections`);
 *     every id the pattern matches (`base` ∪ its `.**` subtree) goes into `seeds`.
 *  2. Negatives: each matched id is `delete`d from `seeds` — UNLESS it is a `named`
 *     positive, which is protected. A negative may therefore only trim ids pulled
 *     in *implicitly* by some `.**` glob; it can never remove an explicitly-named
 *     positive. This keeps resolution a pure additive union (a positive from
 *     anywhere in a flattened `extends` chain wins over a negative from anywhere).
 *
 * Unknown bases (no `subtree` entry) pass through inertly — the base itself is
 * still seeded/trimmed, it just contributes no descendants.
 */
export function expandEntrySeeds(
  entryPoints: Iterable<EntryPattern>,
  graph: EdgeGraph,
): { seeds: Set<PluginId>; named: Set<PluginId> } {
  const seeds = new Set<PluginId>();
  const named = new Set<PluginId>();
  const parsed = [...entryPoints].map(parseEntryPattern);
  for (const p of parsed) {
    if (p.negate) continue;
    named.add(p.base);
    for (const id of matchEntryPattern(p, graph)) seeds.add(id);
  }
  for (const p of parsed) {
    if (!p.negate) continue;
    for (const t of matchEntryPattern(p, graph)) {
      if (named.has(t)) continue; // protected — never trim an explicit positive
      seeds.delete(t);
    }
  }
  return { seeds, named };
}

export function resolveComposition(graph: EdgeGraph, manifest: CompositionManifest): Composition;
export function resolveComposition(tree: PluginTree, manifest: CompositionManifest): Composition;
export function resolveComposition(
  graphOrTree: EdgeGraph | PluginTree,
  manifest: CompositionManifest,
): Composition {
  const graph = isTree(graphOrTree) ? classifyEdges(graphOrTree) : graphOrTree;

  // Entry seeds under the glob grammar: each positive pattern seeds its exact base
  // (hard deps flow in via hardClosure below), plus its whole subtree when written
  // `.**`; negatives trim `.**`-implicit ids (never a named positive). `named` is
  // the set of exact positive bases — it drives `entry` membership and
  // `redundantSelections`, so a `.**` base is `entry` while its implicit descendants
  // are `required`.
  const { seeds: entrySeeds, named } = expandEntrySeeds(manifest.entryPoints, graph);

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
  const entrySet = named;
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
