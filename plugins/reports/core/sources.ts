// Report origins, split by who may report them. ReportSource is derived from the
// arrays so the union and the runtime allow-lists can never drift. Lives in
// core (not the plugin-private shared/) so cross-plugin recorders — e.g.
// slow-ops' record-slow-op — can narrow against the canonical union instead of
// re-declaring their own literal copy.
export const SERVER_REPORT_SOURCES = [
  "server-uncaught",
  "server-unhandled",
  "server-caught",
  "server-slow-op",
  "server-queue-monitor",
  "server-live-state-monitor",
  "server-op-rate-monitor",
  "server-read-set-monitor",
] as const;
export const CLIENT_REPORT_SOURCES = [
  "browser-error",
  "browser-rejection",
  "react-boundary",
  "client-endpoint",
  "live-state-wedge",
  "client-slow-op",
  "client-render-loop",
  "boot-snapshot",
  "plugin-load",
] as const;
export type ReportSource =
  | (typeof SERVER_REPORT_SOURCES)[number]
  | (typeof CLIENT_REPORT_SOURCES)[number];
