import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableSampleRows = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/sample",
});
