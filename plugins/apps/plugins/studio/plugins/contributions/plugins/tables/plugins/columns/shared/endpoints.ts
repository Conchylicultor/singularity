import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableColumns = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/columns",
});
