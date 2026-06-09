import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetSampleRows } from "./internal/sample-rows-handler";
import { getTableSampleRows } from "../shared/endpoints";

export default {
  httpRoutes: {
    [getTableSampleRows.route]: handleGetSampleRows,
  },
} satisfies ServerPluginDefinition;
