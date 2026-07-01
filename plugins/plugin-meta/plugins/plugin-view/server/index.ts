import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleTree } from "./internal/tree-handler";
import { handleFacetsTree } from "./internal/facets-handler";
import { getPluginTree, getPluginFacetsTree } from "../core/endpoints";

export default {
  description:
    "Serves the plugin tree data for the plugin-view pane.",
  httpRoutes: {
    [getPluginTree.route]: handleTree,
    [getPluginFacetsTree.route]: handleFacetsTree,
  },
} satisfies ServerPluginDefinition;
