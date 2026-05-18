import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableIndexes = defineEndpoint({
  route: "GET /api/catalog/tables/:tableName/indexes",
});
