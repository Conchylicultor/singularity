import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableRowCount = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/row-count",
  response: z.object({ estimate: z.number().nullable() }),
});
