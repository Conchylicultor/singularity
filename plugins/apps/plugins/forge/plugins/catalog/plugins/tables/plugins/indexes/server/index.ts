import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetIndexes } from "./internal/indexes-handler";
import { getTableIndexes } from "../shared/endpoints";

export default {
  id: "catalog-tables-indexes",
  name: "Forge: Catalog / Tables / Indexes",
  httpRoutes: {
    [getTableIndexes.route]: handleGetIndexes,
  },
} satisfies ServerPluginDefinition;
