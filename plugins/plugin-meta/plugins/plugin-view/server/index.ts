import type { ServerPluginDefinition } from "@server/types";
import { handleTree } from "./internal/tree-handler";
import { getPluginTree } from "../core/endpoints";

export default {
  id: "plugin-view",
  name: "Plugin View",
  description:
    "Serves the plugin tree data for the plugin-view pane.",
  httpRoutes: {
    [getPluginTree.route]: handleTree,
  },
} satisfies ServerPluginDefinition;
