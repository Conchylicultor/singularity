import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getCatalog, applyCatalogTheme } from "../core/endpoints";
import { handleGetCatalog } from "./internal/handle-get-catalog";
import { handleApply } from "./internal/handle-apply";

export default {
  description:
    "The tweakcn community catalog, and the endpoint that saves one of its themes as a saved theme.",
  httpRoutes: {
    [getCatalog.route]: handleGetCatalog,
    [applyCatalogTheme.route]: handleApply,
  },
} satisfies ServerPluginDefinition;
