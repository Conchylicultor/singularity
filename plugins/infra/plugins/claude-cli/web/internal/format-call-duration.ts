/**
 * A call's wall-clock duration as read in the call log: milliseconds under a
 * second, one decimal of seconds under a minute (a model call's interesting
 * range — 2.9s vs 3.4s matters), then minutes and seconds.
 */
export function formatCallDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const whole = Math.round(s);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, "0")}s`;
}

/** Above this a call reads as slow (the log's duration column warns). */
export const SLOW_CALL_MS = 10_000;
