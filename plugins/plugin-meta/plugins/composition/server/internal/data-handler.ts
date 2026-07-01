import {
  classifyEdges,
  disabledClosure,
  serializeEdgeGraph,
} from "@plugins/plugin-meta/plugins/closure/core";
import { getFacetsTreeCached } from "@plugins/plugin-meta/plugins/plugin-tree/server";
import { getCompositionData } from "@plugins/plugin-meta/plugins/composition/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import type { SerializedEdgeGraph } from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

// The plugin tree build + edge classification is expensive (reads every plugin's
// facets off disk). It is invariant for the process lifetime, so build it once and
// module-cache the serialized graph + the full id set. Mirrors the
// `composition-closure` check's build, but cached for the runtime endpoint.
// (Staleness across a live plugin-tree change is a filed follow-up — invalidate on
// the git-watcher signal if it ever matters for an introspection tool.)
let cached: {
  graph: SerializedEdgeGraph;
  allIds: PluginId[];
  disabledIds: PluginId[];
} | null = null;

async function getGraph(): Promise<{
  graph: SerializedEdgeGraph;
  allIds: PluginId[];
  disabledIds: PluginId[];
}> {
  if (cached) return cached;
  const tree = await getFacetsTreeCached();
  const edgeGraph = classifyEdges(tree);
  const graph = serializeEdgeGraph(edgeGraph);
  const allIds = [...tree.byDir.values()].map((n) => n.id);
  // The disabled cascade: package.json-seeded disabled plugins plus every plugin
  // whose dependent-closure pulls one in. Derived from the same edge graph so the
  // client renders the badge without shipping a per-node `disabled` field.
  const seeds = [...tree.byDir.values()].filter((n) => n.disabled).map((n) => n.id);
  const disabledIds = [...disabledClosure(seeds, edgeGraph)];
  cached = { graph, allIds, disabledIds };
  return cached;
}

// Manifests are no longer served here — they are user data stored in the
// `compositions` config_v2 config and read client-side. This endpoint returns
// only the code-derived graph structure.
export const handleCompositionData = implement(getCompositionData, async () => {
  const { graph, allIds, disabledIds } = await getGraph();
  return { graph, allIds, disabledIds };
});
