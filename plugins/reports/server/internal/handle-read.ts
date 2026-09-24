import { asc, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getReport, reportFacets } from "../../core";
import { _reports } from "./tables";

// The distinct kinds / sources present — the Reports DataView's enum filter
// options. Two DISTINCT scans over a table the 7-day retention keeps small; the
// view refetches them only when `reports.revision` moves.
export const handleReportFacets = implement(reportFacets, async () => {
  const [kinds, sources] = await Promise.all([
    db
      .selectDistinct({ v: _reports.kind })
      .from(_reports)
      .orderBy(asc(_reports.kind)),
    db
      .selectDistinct({ v: _reports.source })
      .from(_reports)
      .orderBy(asc(_reports.source)),
  ]);
  return {
    kinds: kinds.map((r) => r.v),
    sources: sources.map((r) => r.v),
  };
});

// One report by id, whatever its age — the detail pane and its route resolve.
// `null` when no row has the id (see `ReportByIdResponseSchema`).
export const handleGetReport = implement(getReport, async ({ params }) => {
  if (!params.id) throw new HttpError(400, "id required");
  const [row] = await db
    .select()
    .from(_reports)
    .where(eq(_reports.id, params.id))
    .limit(1);
  return { report: row ?? null };
});
