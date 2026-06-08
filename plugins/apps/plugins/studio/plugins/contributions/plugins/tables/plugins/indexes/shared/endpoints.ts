import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableIndexes = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/indexes",
});
