import { z } from "zod";

// Report origins, split by who may report them. ReportSource is derived from the
// arrays so the union and the runtime allow-lists can never drift.
export const SERVER_REPORT_SOURCES = [
  "server-uncaught",
  "server-unhandled",
  "server-caught",
] as const;
export const CLIENT_REPORT_SOURCES = [
  "browser-error",
  "browser-rejection",
  "react-boundary",
  "client-endpoint",
  "live-state-wedge",
] as const;
export type ReportSource =
  | (typeof SERVER_REPORT_SOURCES)[number]
  | (typeof CLIENT_REPORT_SOURCES)[number];

// THE canonical report field list. This is the HTTP body the browser POSTs; the
// server fills in worktree + count + timestamps. `source` is restricted to
// client-reportable origins — server-* sources only arise from in-process
// recordReport callers, never over HTTP.
//
// `kind` discriminates the type of event recorded. Today every report is a
// `crash`; future kinds (e.g. a slow-operation report) reuse the same dedup /
// count / noise / task-filing machinery by setting a different `kind`. It is
// optional on the wire and defaults to "crash" server-side.
//
// Every other boundary (the endpoint contract, the recordReport input type) is
// derived from this schema, so adding a field here can't silently drop it
// downstream.
export const ReportBodySchema = z.object({
  kind: z.string().optional(),
  source: z.enum(CLIENT_REPORT_SOURCES),
  errorType: z.string().nullable().optional(),
  message: z.string(),
  stack: z.string().nullable().optional(),
  componentStack: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  // For react-boundary crashes: which plugin slot rendered the throwing tree
  // (e.g. "Shell.Toolbar") and which contribution inside it (the plugin id or
  // a human label). Omitted for window-level errors — we don't know then.
  slot: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  // Tab that produced the report (sessionStorage-backed) and the build id of the
  // bundle that produced it. Used for attribution + stale-frontend detection.
  clientId: z.string().nullable().optional(),
  buildId: z.string().nullable().optional(),
});
export type ReportBody = z.infer<typeof ReportBodySchema>;

// recordReport input: the same field list as the HTTP body (single-sourced from
// the schema), but `source` widened to every origin since server hooks report
// server-* sources the HTTP endpoint rejects.
export type ReportInput = Omit<ReportBody, "source"> & {
  source: ReportSource;
};
