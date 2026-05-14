import type { ServerPluginDefinition } from "@server/types";
import { handleGetSampleRows } from "./internal/sample-rows-handler";

export default {
  id: "catalog-tables-sample-rows",
  name: "Forge: Catalog / Tables / Sample Rows",
  httpRoutes: {
    "GET /api/catalog/tables/:tableName/sample": handleGetSampleRows,
  },
} satisfies ServerPluginDefinition;
