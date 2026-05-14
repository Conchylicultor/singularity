import type { ServerPluginDefinition } from "@server/types";
import { handleGetIndexes } from "./internal/indexes-handler";

export default {
  id: "catalog-tables-indexes",
  name: "Forge: Catalog / Tables / Indexes",
  httpRoutes: {
    "GET /api/catalog/tables/:tableName/indexes": handleGetIndexes,
  },
} satisfies ServerPluginDefinition;
