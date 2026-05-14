import type { ServerPluginDefinition } from "@server/types";
import { handleGetRowCount } from "./internal/row-count-handler";

export default {
  id: "catalog-tables-row-count",
  name: "Forge: Catalog / Tables / Row Count",
  httpRoutes: {
    "GET /api/catalog/tables/:tableName/row-count": handleGetRowCount,
  },
} satisfies ServerPluginDefinition;
