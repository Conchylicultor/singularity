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
  "server-boot-budget-monitor",
  "server-boot-monitor",
  "server-boot-watchdog",
  "server-session-monitor",
  "server-transcript-watcher",
  "server-duress-shed",
  // The reports engine's own fan-out rollup: filed by recordReport when a kind
  // blows past its per-window distinct-fingerprint ceiling and the alerts are
  // collapsed into one accounting row.
  "server-report-storm",
  "server-duress-monitor",
  "server-stall-monitor",
  "server-cost-monitor",
  // A report a backend filed synchronously on its way out of a DELIBERATE
  // `process.exit()` — not a crash (nothing threw) and not a caught error
  // (nobody is still running to catch it). Its own source because that
  // distinction is the whole content of the report: the process decided its
  // state was unrecoverable and said so before leaving.
  "server-fatal",
] as const;
export const CLIENT_REPORT_SOURCES = [
  "browser-error",
  "browser-rejection",
  "react-boundary",
  "client-endpoint",
  "live-state-wedge",
  "client-slow-op",
  "client-render-loop",
  "client-optimistic-divergence",
  "client-turn-unconfirmed",
  "client-live-state-stale-drop",
  "client-caret-flight",
  "client-adaptive-bar",
  "client-viewport-escape",
  "client-collab-hydration",
  "boot-snapshot",
  "plugin-load",
  "client-storage",
] as const;
export type ReportSource =
  | (typeof SERVER_REPORT_SOURCES)[number]
  | (typeof CLIENT_REPORT_SOURCES)[number];
