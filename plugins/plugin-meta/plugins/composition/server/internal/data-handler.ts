import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { classifyEdges, serializeEdgeGraph } from "@plugins/plugin-meta/plugins/closure/core";
import { getCompositionData, loadCompositions } from "@plugins/plugin-meta/plugins/composition/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";
import type { SerializedEdgeGraph } from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

// The plugin tree build + edge classification is expensive (reads every plugin's
// facets off disk). It is invariant for the process lifetime, so build it once and
// module-cache the serialized graph + the full id set. Mirrors the
// `composition-closure` check's build, but cached for the runtime endpoint.
// (Staleness across a live plugin-tree change is a filed follow-up — invalidate on
// the git-watcher signal if it ever matters for an introspection tool.)
let cached: { graph: SerializedEdgeGraph; allIds: PluginId[] } | null = null;

async function getGraph(): Promise<{ graph: SerializedEdgeGraph; allIds: PluginId[] }> {
  if (cached) return cached;
  const tree = await buildPluginTree(PLUGINS_DIR, { skipBarrelImport: true });
  const graph = serializeEdgeGraph(classifyEdges(tree));
  const allIds = [...tree.byDir.values()].map((n) => n.id);
  cached = { graph, allIds };
  return cached;
}

export const handleCompositionData = implement(getCompositionData, async () => {
  const [{ graph, allIds }, manifests] = await Promise.all([getGraph(), loadCompositions()]);
  return { graph, manifests, allIds };
});
