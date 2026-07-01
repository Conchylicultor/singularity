import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  getStructureTreeCached,
  getFacetsTreeCached,
} from "./internal/structure-tree-cache";

export default {
  description:
    "Cached, watcher-invalidated plugin-tree accessors: structure-only for the hot path and a shared full-faceted build for the two facet consumers.",
} satisfies ServerPluginDefinition;
