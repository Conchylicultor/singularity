import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const CrashReportBodySchema = z.object({
  source: z.string(),
  errorType: z.string().nullable().optional(),
  message: z.string(),
  stack: z.string().nullable().optional(),
  componentStack: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  slot: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
});
export type CrashReportBody = z.infer<typeof CrashReportBodySchema>;

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
