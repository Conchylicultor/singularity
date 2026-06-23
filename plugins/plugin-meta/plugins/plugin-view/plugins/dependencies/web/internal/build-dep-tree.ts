import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";
import type {
  EdgeGraph,
  EdgeKind,
} from "@plugins/plugin-meta/plugins/closure/core";

/** Which faces of the dependency graph to walk from the root. */
export type DepDirection = "deps" | "dependents";

export interface DepTreeNode {
  id: PluginId;
  /** How THIS node was reached from its parent ("hard" import | "soft" contribution). */
  kind: EdgeKind;
  /** true ⇒ first occurrence is elsewhere; render as a marked leaf with no children. */
  duplicate: boolean;
  /** Empty when `duplicate`. */
  children: DepTreeNode[];
}

export interface DepTree {
  roots: DepTreeNode[];
  /** Distinct plugins in the closure (excludes the root). */
  total: number;
}

const get = (m: Map<PluginId, PluginId[]>, id: PluginId): PluginId[] =>
  m.get(id) ?? [];

/**
 * Builds a deduped cargo-tree-style spanning tree from the live {@link EdgeGraph}.
 *
 * Children of a node are its hard edges (kind `"hard"`) ∪ soft edges (kind `"soft"`)
 * in the chosen direction. The per-parent child list is deduped by id, hard-first
 * (a child reachable via both kinds keeps its hard occurrence). A single `seen` set
 * spans the whole walk (seeded with `rootId`): the first occurrence of a plugin
 * expands fully; every later occurrence is a `duplicate` leaf with no children —
 * which collapses DAG diamonds and breaks any theoretical cycle. `total` is the
 * distinct closure size excluding the root.
 */
export function buildDepTree(
  graph: EdgeGraph,
  rootId: PluginId,
  direction: DepDirection,
): DepTree {
  const hardMap =
    direction === "deps" ? graph.hardForward : graph.hardReverse;
  const softMap =
    direction === "deps" ? graph.softForward : graph.softReverse;

  // Distinct, kind-tagged child list for one parent: hard-first dedupe by id.
  function childEdges(id: PluginId): { id: PluginId; kind: EdgeKind }[] {
    const byId = new Map<PluginId, EdgeKind>();
    for (const childId of get(hardMap, id)) {
      if (!byId.has(childId)) byId.set(childId, "hard");
    }
    for (const childId of get(softMap, id)) {
      if (!byId.has(childId)) byId.set(childId, "soft");
    }
    return [...byId].map(([childId, kind]) => ({ id: childId, kind }));
  }

  const seen = new Set<PluginId>([rootId]);

  function walk(id: PluginId, kind: EdgeKind): DepTreeNode {
    if (seen.has(id)) {
      return { id, kind, duplicate: true, children: [] };
    }
    seen.add(id);
    const children = childEdges(id).map((e) => walk(e.id, e.kind));
    return { id, kind, duplicate: false, children };
  }

  const roots = childEdges(rootId).map((e) => walk(e.id, e.kind));

  return { roots, total: seen.size - 1 };
}
