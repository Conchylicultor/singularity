import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

export interface BoundaryErrorReport {
  error: Error;
  componentStack: string | null;
  slot: string | null;
  label: string | null;
}

// Set by a domain plugin (e.g. `reports.crash`) at mount time. The boundary
// stores whatever the reporter returns as opaque `context` and threads it to
// ErrorBoundary.Action contributions. The boundary primitive never looks at the
// shape — that's the contract between the reporter-owner and action contributors.
// emit() returns the handler's Promise (or sync value) so the boundary can await
// the resolved context; it swallows a throw since it runs on the error path.
export const boundaryReportSink = defineReportSink<
  BoundaryErrorReport,
  Promise<unknown> | unknown | void
>();
