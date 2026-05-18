import type { ServerPluginDefinition } from "@server/types";
import { handleGetRowCount } from "./internal/row-count-handler";
import { getTableRowCount } from "../shared/endpoints";

export default {
  id: "catalog-tables-row-count",
  name: "Forge: Catalog / Tables / Row Count",
  httpRoutes: {
    [getTableRowCount.route]: handleGetRowCount,
  },
} satisfies ServerPluginDefinition;
