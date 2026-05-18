import type { ServerPluginDefinition } from "@server/types";
import { handleGetSampleRows } from "./internal/sample-rows-handler";
import { getTableSampleRows } from "../shared/endpoints";

export default {
  id: "catalog-tables-sample-rows",
  name: "Forge: Catalog / Tables / Sample Rows",
  httpRoutes: {
    [getTableSampleRows.route]: handleGetSampleRows,
  },
} satisfies ServerPluginDefinition;
