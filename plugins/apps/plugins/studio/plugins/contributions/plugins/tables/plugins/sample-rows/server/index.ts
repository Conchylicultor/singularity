import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleGetSampleRows } from "./internal/sample-rows-handler";
import { getTableSampleRows } from "../shared/endpoints";

export default {
  name: "Studio: Contributions / Tables / Sample Rows",
  httpRoutes: {
    [getTableSampleRows.route]: handleGetSampleRows,
  },
} satisfies ServerPluginDefinition;
