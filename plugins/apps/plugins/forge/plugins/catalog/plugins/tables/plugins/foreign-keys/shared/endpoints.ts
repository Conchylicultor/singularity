import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableForeignKeys = defineEndpoint({
  route: "GET /api/catalog/tables/:tableName/foreign-keys",
});
