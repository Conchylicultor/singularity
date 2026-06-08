import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const ColumnSchema = z.object({
  column_name: z.string(),
  data_type: z.string(),
  is_nullable: z.string(),
  column_default: z.string().nullable(),
  ordinal_position: z.number(),
});

export const getTableColumns = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/columns",
  response: z.object({ columns: z.array(ColumnSchema) }),
});
