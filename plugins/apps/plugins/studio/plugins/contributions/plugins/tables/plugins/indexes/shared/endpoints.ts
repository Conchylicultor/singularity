import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const IndexSchema = z.object({
  indexname: z.string(),
  indexdef: z.string(),
});

export const getTableIndexes = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/indexes",
  response: z.object({ indexes: z.array(IndexSchema) }),
});
