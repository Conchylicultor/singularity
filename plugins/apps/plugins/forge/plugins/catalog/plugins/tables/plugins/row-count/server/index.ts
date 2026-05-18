import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetRowCount } from "./internal/row-count-handler";
import { getTableRowCount } from "../shared/endpoints";

export default {
  id: "catalog-tables-row-count",
  name: "Forge: Catalog / Tables / Row Count",
  httpRoutes: {
    [getTableRowCount.route]: handleGetRowCount,
  },
} satisfies ServerPluginDefinition;
