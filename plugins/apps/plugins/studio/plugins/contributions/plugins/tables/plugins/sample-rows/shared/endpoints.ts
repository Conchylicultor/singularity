import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getTableSampleRows = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/sample",
  response: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.unknown())),
  }),
});
