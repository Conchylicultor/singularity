import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ReportBodySchema } from "./types";

export const ReportResultSchema = z.object({
  taskId: z.string().nullable(),
  wasNew: z.boolean(),
  rateLimited: z.boolean(),
});
export type ReportResult = z.infer<typeof ReportResultSchema>;

export const submitReport = defineEndpoint({
  route: "POST /api/reports",
  body: ReportBodySchema,
  response: ReportResultSchema,
});
