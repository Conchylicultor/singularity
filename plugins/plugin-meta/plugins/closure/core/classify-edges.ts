import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import { crossRefsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/cross-refs/core";
import { slotsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/slots/core";
import { contributionsFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/contributions/core";
import type { EdgeGraph, Edge } from "./types";

function pushUnique(map: Map<PluginId, PluginId[]>, key: PluginId, value: PluginId): void {
  const list = map.get(key)!;
  if (!list.includes(value)) list.push(value);
}

/**
 * Build the hard/soft cross-plugin dependency graph from facet data already
 * serialized into the tree. Pure and browser-safe — reads only `node.facets`.
 *
 * Hard edges come from `cross-refs.apiUses` imports (unioned across runtimes,
 * self-edges dropped — precise & nested-aware after the cross-refs rework). Note
 * these are *import* edges only: importing a parent umbrella's barrel does NOT
 * pull in its children (the barrel re-exports the umbrella's own symbols, not the
 * sub-plugins). Parent→child *containment* is therefore deliberately NOT a hard
 * edge; it is captured separately in `subtree` and applied only at entry seeding
 * (selecting an umbrella *as an entry* ships its subtree; merely importing it does
 * not).
 *
 * Soft edges come from slot ownership (`slots` facet, first-writer-wins per group,
 * `_runtimeOnly` slots skipped) crossed with each plugin's `contributions.static`
 * slots — exactly mirroring `contributions.relate()`, but keyed by `PluginId`
 * rather than `name`.
 */
export function classifyEdges(tree: PluginTree): EdgeGraph {
  const hardForward = new Map<PluginId, PluginId[]>();
  const hardReverse = new Map<PluginId, PluginId[]>();
  const softForward = new Map<PluginId, PluginId[]>();
  const softReverse = new Map<PluginId, PluginId[]>();
  const subtree = new Map<PluginId, PluginId[]>();

  // Seed every node as a key so callers never branch on undefined.
  for (const node of tree.byDir.values()) {
    hardForward.set(node.id, []);
    hardReverse.set(node.id, []);
    softForward.set(node.id, []);
    softReverse.set(node.id, []);
    subtree.set(node.id, []);
  }

  // ── Containment: node → all descendant ids (its proper subtree) ────────
  for (const node of tree.byDir.values()) {
    const descendants = subtree.get(node.id)!;
    const stack = [...node.children];
    while (stack.length) {
      const child = stack.pop()!;
      descendants.push(child.id);
      stack.push(...child.children);
    }
  }

  // ── Hard edges: union apiUses across runtimes, drop self ───────────────
  for (const node of tree.byDir.values()) {
    const crossRefs = getFacet(node, crossRefsFacetDef);
    if (!crossRefs) continue;
    for (const uses of Object.values(crossRefs.apiUses)) {
      for (const use of uses) {
        if (use.plugin === node.id) continue; // self-edge
        if (!hardForward.has(use.plugin)) continue; // unknown target — inert
        pushUnique(hardForward, node.id, use.plugin);
        pushUnique(hardReverse, use.plugin, node.id);
      }
    }
  }

  // ── Soft edges: slot-group ownership × static contributions ───────────
  // groupName → owning PluginId. Skip `_runtimeOnly` slots; first-writer-wins.
  const groupOwner = new Map<string, PluginId>();
  for (const node of tree.byDir.values()) {
    const slots = getFacet(node, slotsFacetDef) ?? [];
    for (const slot of slots) {
      if ((slot as { _runtimeOnly?: boolean })._runtimeOnly) continue;
      if (!groupOwner.has(slot.groupName)) groupOwner.set(slot.groupName, node.id);
    }
  }

  for (const node of tree.byDir.values()) {
    const data = getFacet(node, contributionsFacetDef);
    if (!data) continue;
    // Collect the distinct slot groups this plugin contributes to.
    const groups = new Set<string>();
    for (const contribution of data.static) {
      const head = contribution.slot.split(".")[0];
      if (head) groups.add(head);
    }
    for (const group of groups) {
      const owner = groupOwner.get(group);
      if (!owner || owner === node.id) continue;
      pushUnique(softForward, node.id, owner);
      pushUnique(softReverse, owner, node.id);
    }
  }

  // ── Derived flat edge list ────────────────────────────────────────────
  const edges: Edge[] = [];
  for (const [from, tos] of hardForward) for (const to of tos) edges.push({ from, to, kind: "hard" });
  for (const [from, tos] of softForward) for (const to of tos) edges.push({ from, to, kind: "soft" });

  return { hardForward, hardReverse, softForward, softReverse, subtree, edges };
}
