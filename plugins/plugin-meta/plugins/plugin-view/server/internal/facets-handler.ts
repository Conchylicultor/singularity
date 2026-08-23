import { getFacetsTreeCached } from "@plugins/plugin-meta/plugins/plugin-tree/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPluginFacetsTree } from "../../core/endpoints";
import { treeToPayload } from "./to-payload";

// Full faceted tree for the two genuine facet consumers (Studio Contributions +
// the plugin detail pane, which needs the relate'd `importedBy` reverse index).
// Sourced from the shared, watcher-invalidated cache — one faceted build shared
// across both. Exclusion from the app is derived client-side, from the
// composition edge graph — this payload carries no membership field.
export const handleFacetsTree = implement(getPluginFacetsTree, async () => {
  const tree = await getFacetsTreeCached();
  return treeToPayload(tree);
});
