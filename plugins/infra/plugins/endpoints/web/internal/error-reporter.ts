import { defineReportSink } from "@plugins/primitives/plugins/report-sink/core";

export interface EndpointErrorInfo {
  // The endpoint route, e.g. "POST /api/tasks/chain". Already bundles method + path.
  route: string;
  status: number;
  // The parsed error response body (JSON object, string, or null).
  body: unknown;
}

// Set by a domain plugin (e.g. `reports.endpoint-errors`) at mount time. The
// endpoints primitive fires this for EVERY non-ok response and never inspects
// the shape — the registered reporter decides which errors are worth recording.
// The sink stays domain-agnostic so the primitive never depends on `reports`.
export const endpointErrorSink = defineReportSink<EndpointErrorInfo>();
