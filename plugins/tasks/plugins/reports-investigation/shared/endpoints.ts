import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ReportKindScopeSchema } from "./scope";

/**
 * Every registered report kind with its severity and how many uninvestigated
 * reports of it have occurred at least `minCount` times — what the Which
 * reports section lists and counts.
 */
export const getReportScope = defineEndpoint({
  route: "GET /api/report-investigations/scope",
  query: z.object({ minCount: z.coerce.number().int().min(1) }),
  response: z.object({ kinds: z.array(ReportKindScopeSchema) }),
});
