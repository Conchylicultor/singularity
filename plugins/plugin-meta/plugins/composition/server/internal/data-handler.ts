import {
  classifyEdges,
  disabledClosure,
  serializeEdgeGraph,
} from "@plugins/plugin-meta/plugins/closure/core";
import { getFacetsTreeCached } from "@plugins/plugin-meta/plugins/plugin-tree/server";
import { getCompositionData } from "@plugins/plugin-meta/plugins/composition/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import type { CompositionData } from "@plugins/plugin-meta/plugins/composition/core";
import type { PluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";

// The expensive part is the facets tree build, which plugin-tree already caches
// (watcher-invalidated, warmed post-boot on main). The derivations on top of it
// are cheap (~10ms measured: classify 8ms + serialize 1ms + two id scans), so
// they are memoized per tree IDENTITY: when plugin-tree's memo rebuilds, the new
// tree object misses the WeakMap and the graph is re-derived. This replaces the
// old process-lifetime module cache, which never invalidated — after any live
// plugin change it kept serving the boot-time graph forever (the staleness
// follow-up noted in this plugin's CLAUDE.md).
const derived = new WeakMap<PluginTree, CompositionData>();

function deriveCompositionData(tree: PluginTree): CompositionData {
  const hit = derived.get(tree);
  if (hit) return hit;
  const edgeGraph = classifyEdges(tree);
  const graph = serializeEdgeGraph(edgeGraph);
  const allIds = [...tree.byDir.values()].map((n) => n.id);
  // The disabled cascade: package.json-seeded disabled plugins plus every plugin
  // whose dependent-closure pulls one in. Derived from the same edge graph so the
  // client renders the badge without shipping a per-node `disabled` field.
  const seeds = [...tree.byDir.values()].filter((n) => n.disabled).map((n) => n.id);
  const disabledIds = [...disabledClosure(seeds, edgeGraph)];
  const data = { graph, allIds, disabledIds };
  derived.set(tree, data);
  return data;
}

// Manifests are not served here — they are user data stored in the
// `compositions` config_v2 config and read client-side. This endpoint returns
// only the code-derived graph structure.
export const handleCompositionData = implement(getCompositionData, async () => {
  return deriveCompositionData(await getFacetsTreeCached());
});
