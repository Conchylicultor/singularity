import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableColumns = defineEndpoint({
  route: "GET /api/catalog/tables/:tableName/columns",
});
