import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetForeignKeys } from "./internal/foreign-keys-handler";
import { getTableForeignKeys } from "../shared/endpoints";

export default {
  id: "catalog-tables-foreign-keys",
  name: "Forge: Catalog / Tables / Foreign Keys",
  httpRoutes: {
    [getTableForeignKeys.route]: handleGetForeignKeys,
  },
} satisfies ServerPluginDefinition;
