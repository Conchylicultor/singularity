import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import type { ReportBody } from "../shared/types";
import { submitReport, investigateReport, type ReportResult } from "../shared/endpoints";

export type { ReportResult };

// On-demand: turn a recorded report into an investigation task. Idempotent on
// the server (re-calling returns the existing live task). Resolves to the task
// id, which the caller binds a launched conversation to.
export async function investigate(reportId: string): Promise<{ taskId: string }> {
  return await fetchEndpoint(investigateReport, { id: reportId });
}

// The caller-supplied portion of a report: the browser picks the kind, the
// source (client-reportable only — enforced by ReportBodySchema's enum), the
// generic summary, and the kind's `data` payload; report() stamps
// clientId/buildId itself.
export type ClientReportBody = Omit<ReportBody, "clientId" | "buildId">;

// Shape of the `context` value the reports plugin's boundary reporter returns.
// Action contributors (e.g. launch-fix) cast `context: unknown` down to this
// type. A report no longer auto-creates a task, so the Fix button investigates
// the report on demand via `reportId`; `taskId` stays null until then.
export interface ReportContext {
  reportId: string | null;
  taskId: string | null;
}

// POST to /api/reports via the typed endpoint. Never throws: we're in an error
// path already. `keepalive: true` lets the request survive page unload.
// `report: false` stops fetchEndpoint from invoking the error-reporter, which
// would recurse (a failing report beacon must not file a report about itself).
// Returns null if the request fails or was discarded during unload.
export async function report(body: ClientReportBody): Promise<ReportResult | null> {
  try {
    const stamped = {
      ...body,
      clientId: getTabId(),
      buildId: import.meta.env.VITE_BUILD_ID ?? null,
    };
    return await fetchEndpoint(submitReport, {}, { body: stamped, keepalive: true, report: false });
  // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- this is called during crash/error handling (keepalive fetch at page unload); propagating here would hide the original error and crash the error handler itself
  } catch {
    return null;
  }
}
