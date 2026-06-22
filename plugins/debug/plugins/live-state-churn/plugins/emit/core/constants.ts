/** Global key for the window-level imperative emit API (headless e2e). */
export const LIVE_STATE_EMIT_GLOBAL = "__liveStateEmit";

/** Auto-stop after this long when the caller omits `durationMs`. */
export const DEFAULT_EMIT_DURATION_MS = 5 * 60_000;

/** Hard cap on a session's lifetime — a forgotten session can't churn forever. */
export const MAX_EMIT_DURATION_MS = 30 * 60_000;

/** Pushes/sec ceiling for a single emit session. */
export const MAX_EMIT_RATE = 100;
