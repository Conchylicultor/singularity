import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetRowCount } from "./internal/row-count-handler";
import { getTableRowCount } from "../shared/endpoints";

export default {
  httpRoutes: {
    [getTableRowCount.route]: handleGetRowCount,
  },
} satisfies ServerPluginDefinition;
