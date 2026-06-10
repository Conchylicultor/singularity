export type CrashSource =
  | "server-uncaught"
  | "server-unhandled"
  | "server-caught"
  | "browser-error"
  | "browser-rejection"
  | "react-boundary"
  | "client-endpoint";

// POST /api/crashes body. Server fills in worktree + count + timestamps.
export interface CrashReport {
  source: CrashSource;
  errorType?: string | null;
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  url?: string | null;
  userAgent?: string | null;
  // For react-boundary crashes: which plugin slot rendered the throwing tree
  // (e.g. "Shell.Toolbar") and which contribution inside it (the plugin id or
  // a human label). Omitted for window-level errors — we don't know then.
  slot?: string | null;
  label?: string | null;
  // Tab that produced the crash (sessionStorage-backed) and the build id of the
  // bundle that produced it. Used for attribution + stale-frontend detection.
  clientId?: string | null;
  buildId?: string | null;
}
