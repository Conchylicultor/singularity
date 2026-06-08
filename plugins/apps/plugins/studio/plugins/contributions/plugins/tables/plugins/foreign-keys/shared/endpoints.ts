import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const OutgoingFkSchema = z.object({
  constraint_name: z.string(),
  column_name: z.string(),
  foreign_table: z.string(),
  foreign_column: z.string(),
});

const IncomingFkSchema = z.object({
  constraint_name: z.string(),
  source_table: z.string(),
  source_column: z.string(),
  target_column: z.string(),
});

export const getTableForeignKeys = defineEndpoint({
  route: "GET /api/studio/tables/:tableName/foreign-keys",
  response: z.object({
    outgoing: z.array(OutgoingFkSchema),
    incoming: z.array(IncomingFkSchema),
  }),
});
