import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import type { CrashReportBody } from "../shared/types";
import { reportCrash, type CrashReportResult } from "../shared/endpoints";

export type { CrashReportResult };

// The caller-supplied portion of a crash report: the browser picks the source
// (client-reportable only — enforced by CrashReportBodySchema's enum) and the
// descriptive fields; report() stamps clientId/buildId itself.
export type ClientCrashReport = Omit<CrashReportBody, "clientId" | "buildId">;

// Shape of the `context` value the crashes plugin's boundary reporter
// returns. Action contributors (e.g. launch-fix) cast `context: unknown`
// down to this type to read the recorded crash's taskId.
export interface CrashContext {
  taskId: string | null;
}

// POST to /api/crashes via the typed endpoint. Never throws: we're in an error
// path already. `keepalive: true` lets the request survive page unload.
// `report: false` stops fetchEndpoint from invoking the crash error-reporter,
// which would recurse (a failing crash beacon must not file a crash about
// itself). Returns null if the request fails or was discarded during unload.
export async function report(body: ClientCrashReport): Promise<CrashReportResult | null> {
  try {
    const stamped = {
      ...body,
      clientId: getTabId(),
      buildId: import.meta.env.VITE_BUILD_ID ?? null,
    };
    return await fetchEndpoint(reportCrash, {}, { body: stamped, keepalive: true, report: false });
  // eslint-disable-next-line promise-safety/no-bare-catch -- this is called during crash/error handling (keepalive fetch at page unload); propagating here would hide the original error and crash the error handler itself
  } catch {
    return null;
  }
}
