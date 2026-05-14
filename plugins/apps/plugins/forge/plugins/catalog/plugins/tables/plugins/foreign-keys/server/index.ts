import type { ServerPluginDefinition } from "@server/types";
import { handleGetForeignKeys } from "./internal/foreign-keys-handler";

export default {
  id: "catalog-tables-foreign-keys",
  name: "Forge: Catalog / Tables / Foreign Keys",
  httpRoutes: {
    "GET /api/catalog/tables/:tableName/foreign-keys": handleGetForeignKeys,
  },
} satisfies ServerPluginDefinition;
