import { getStructureTreeCached } from "@plugins/plugin-meta/plugins/plugin-tree/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPluginTree } from "../../core/endpoints";
import { treeToPayload } from "./to-payload";

// Structure-only + cached: the hot path never reads facets, so it builds steps
// 1–3 only (no facet extract/relate, no barrel import) and serves it from the
// watcher-invalidated cache. The disabled cascade is derived client-side.
export const handleTree = implement(getPluginTree, async () => {
  const tree = await getStructureTreeCached();
  return treeToPayload(tree);
});
