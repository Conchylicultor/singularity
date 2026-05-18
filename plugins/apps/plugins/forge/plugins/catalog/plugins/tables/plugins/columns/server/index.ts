import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetColumns } from "./internal/columns-handler";
import { getTableColumns } from "../shared/endpoints";

export default {
  id: "catalog-tables-columns",
  name: "Forge: Catalog / Tables / Columns",
  httpRoutes: {
    [getTableColumns.route]: handleGetColumns,
  },
} satisfies ServerPluginDefinition;
