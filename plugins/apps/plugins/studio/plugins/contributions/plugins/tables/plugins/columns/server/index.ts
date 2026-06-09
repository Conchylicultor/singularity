import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetColumns } from "./internal/columns-handler";
import { getTableColumns } from "../shared/endpoints";

export default {
  httpRoutes: {
    [getTableColumns.route]: handleGetColumns,
  },
} satisfies ServerPluginDefinition;
