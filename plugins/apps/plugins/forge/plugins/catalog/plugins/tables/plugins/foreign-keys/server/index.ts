import type { ServerPluginDefinition } from "@server/types";
import { handleGetForeignKeys } from "./internal/foreign-keys-handler";
import { getTableForeignKeys } from "../shared/endpoints";

export default {
  id: "catalog-tables-foreign-keys",
  name: "Forge: Catalog / Tables / Foreign Keys",
  httpRoutes: {
    [getTableForeignKeys.route]: handleGetForeignKeys,
  },
} satisfies ServerPluginDefinition;
