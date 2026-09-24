import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getReport, type Report } from "@plugins/reports/core";
import { useRefetchOnReportsRevision } from "./revision";

/**
 * What a by-id read of one report can say. Four arms: folding `error` into
 * `missing` would let a transient 500 tell the user their report does not exist,
 * and folding it into `pending` would spin forever (the `useRun` precedent).
 */
export type ReportRead =
  | { status: "pending" }
  | { status: "error"; error: Error }
  /** The table was read and holds no such row. An answer, not an absence. */
  | { status: "missing" }
  | { status: "found"; report: Report; refetch: () => Promise<unknown> };

/**
 * One report by id, whatever its age — the detail pane and its route resolve.
 * Refetched in place when `reports.revision` moves; callers that change the row
 * themselves (Investigate) call `refetch` directly so the change shows at once
 * rather than after the tick's debounce.
 */
export function useReport(reportId: string): ReportRead {
  const { data, isPending, error, refetch } = useEndpoint(getReport, {
    id: reportId,
  });
  useRefetchOnReportsRevision(refetch);

  if (error) return { status: "error", error };
  if (isPending || !data) return { status: "pending" };
  return data.report
    ? { status: "found", report: data.report, refetch }
    : { status: "missing" };
}
