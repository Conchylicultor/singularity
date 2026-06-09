import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetForeignKeys } from "./internal/foreign-keys-handler";
import { getTableForeignKeys } from "../shared/endpoints";

export default {
  httpRoutes: {
    [getTableForeignKeys.route]: handleGetForeignKeys,
  },
} satisfies ServerPluginDefinition;
