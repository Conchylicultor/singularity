import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableSampleRows = defineEndpoint({
  route: "GET /api/catalog/tables/:tableName/sample",
});
