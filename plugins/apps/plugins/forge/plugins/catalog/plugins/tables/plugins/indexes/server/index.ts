import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetIndexes } from "./internal/indexes-handler";
import { getTableIndexes } from "../shared/endpoints";

export default {
  name: "Forge: Catalog / Tables / Indexes",
  httpRoutes: {
    [getTableIndexes.route]: handleGetIndexes,
  },
} satisfies ServerPluginDefinition;
