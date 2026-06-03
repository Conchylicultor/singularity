import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleTree } from "./internal/tree-handler";
import { getPluginTree } from "../core/endpoints";

export default {
  name: "Plugin View",
  description:
    "Serves the plugin tree data for the plugin-view pane.",
  httpRoutes: {
    [getPluginTree.route]: handleTree,
  },
} satisfies ServerPluginDefinition;
