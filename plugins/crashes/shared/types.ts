export type CrashSource =
  | "server-uncaught"
  | "server-unhandled"
  | "browser-error"
  | "browser-rejection"
  | "react-boundary";

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
}
