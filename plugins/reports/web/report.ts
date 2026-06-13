import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import type { ReportBody } from "../shared/types";
import { submitReport, type ReportResult } from "../shared/endpoints";

export type { ReportResult };

// The caller-supplied portion of a report: the browser picks the source
// (client-reportable only — enforced by ReportBodySchema's enum) and the
// descriptive fields; report() stamps clientId/buildId itself.
export type ClientReportBody = Omit<ReportBody, "clientId" | "buildId">;

// Shape of the `context` value the reports plugin's boundary reporter
// returns. Action contributors (e.g. launch-fix) cast `context: unknown`
// down to this type to read the recorded report's taskId.
export interface ReportContext {
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
  // eslint-disable-next-line promise-safety/no-bare-catch -- this is called during crash/error handling (keepalive fetch at page unload); propagating here would hide the original error and crash the error handler itself
  } catch {
    return null;
  }
}
