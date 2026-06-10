import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { CrashReportBodySchema } from "./types";

export const CrashReportResultSchema = z.object({
  taskId: z.string().nullable(),
  wasNew: z.boolean(),
  crashLoop: z.boolean(),
});
export type CrashReportResult = z.infer<typeof CrashReportResultSchema>;

export const reportCrash = defineEndpoint({
  route: "POST /api/crashes",
  body: CrashReportBodySchema,
  response: CrashReportResultSchema,
});
