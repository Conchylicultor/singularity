import { z } from "zod";

// Crash origins, split by who may report them. CrashSource is derived from the
// arrays so the union and the runtime allow-lists can never drift.
export const SERVER_CRASH_SOURCES = [
  "server-uncaught",
  "server-unhandled",
  "server-caught",
] as const;
export const CLIENT_CRASH_SOURCES = [
  "browser-error",
  "browser-rejection",
  "react-boundary",
  "client-endpoint",
  "live-state-wedge",
] as const;
export type CrashSource =
  | (typeof SERVER_CRASH_SOURCES)[number]
  | (typeof CLIENT_CRASH_SOURCES)[number];

// THE canonical crash-report field list. This is the HTTP body the browser
// POSTs; the server fills in worktree + count + timestamps. `source` is
// restricted to client-reportable origins — server-* sources only arise from
// in-process recordCrash callers, never over HTTP.
//
// Every other boundary (the endpoint contract, the recordCrash input type) is
// derived from this schema, so adding a field here can't silently drop it
// downstream.
export const CrashReportBodySchema = z.object({
  source: z.enum(CLIENT_CRASH_SOURCES),
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
  // Tab that produced the crash (sessionStorage-backed) and the build id of the
  // bundle that produced it. Used for attribution + stale-frontend detection.
  clientId: z.string().nullable().optional(),
  buildId: z.string().nullable().optional(),
});
export type CrashReportBody = z.infer<typeof CrashReportBodySchema>;

// recordCrash input: the same field list as the HTTP body (single-sourced from
// the schema), but `source` widened to every origin since server hooks report
// server-* sources the HTTP endpoint rejects.
export type CrashReport = Omit<CrashReportBody, "source"> & {
  source: CrashSource;
};
