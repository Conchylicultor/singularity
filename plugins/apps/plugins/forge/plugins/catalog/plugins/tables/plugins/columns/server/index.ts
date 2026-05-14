import type { ServerPluginDefinition } from "@server/types";
import { handleGetColumns } from "./internal/columns-handler";

export default {
  id: "catalog-tables-columns",
  name: "Forge: Catalog / Tables / Columns",
  httpRoutes: {
    "GET /api/catalog/tables/:tableName/columns": handleGetColumns,
  },
} satisfies ServerPluginDefinition;
