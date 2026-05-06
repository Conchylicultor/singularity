import type { ServerPluginDefinition } from "@server/types";
import { handleTree } from "./internal/tree-handler";

export default {
  id: "plugin-view",
  name: "Plugin View",
  description:
    "Serves the plugin tree data for the plugin-view pane.",
  httpRoutes: {
    "GET /api/plugin-view/tree": handleTree,
  },
} satisfies ServerPluginDefinition;
