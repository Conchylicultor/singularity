import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableRowCount = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/row-count",
});
