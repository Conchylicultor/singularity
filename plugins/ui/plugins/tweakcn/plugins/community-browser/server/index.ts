import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getCatalog, applyCatalogTheme } from "../core/endpoints";
import { handleGetCatalog } from "./internal/handle-get-catalog";
import { handleApply } from "./internal/handle-apply";

export default {
  id: "ui-tweakcn-community-browser",
  name: "UI: Tweakcn Community Browser",
  description:
    "Community theme catalog and apply endpoints for tweakcn.",
  httpRoutes: {
    [getCatalog.route]: handleGetCatalog,
    [applyCatalogTheme.route]: handleApply,
  },
} satisfies ServerPluginDefinition;
