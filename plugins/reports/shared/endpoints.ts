import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ReportBodySchema } from "./types";

export const ReportResultSchema = z.object({
  // The id of the persisted report row, so the crash boundary reporter can hand
  // it to launch-fix (which now creates the investigation task on demand).
  reportId: z.string().nullable(),
  // No report auto-creates a task anymore; this stays null until the user clicks
  // "investigate". Kept so existing rows / dedup reads still flow through.
  taskId: z.string().nullable(),
  rateLimited: z.boolean(),
});
export type ReportResult = z.infer<typeof ReportResultSchema>;

export const submitReport = defineEndpoint({
  route: "POST /api/reports",
  body: ReportBodySchema,
  response: ReportResultSchema,
});

export const InvestigateResultSchema = z.object({
  taskId: z.string(),
});
export type InvestigateResult = z.infer<typeof InvestigateResultSchema>;

export const investigateReport = defineEndpoint({
  route: "POST /api/reports/:id/investigate",
  response: InvestigateResultSchema,
});
