// Format a millisecond duration as a compact human string ("1h 10m", "45s",
// "2m 03s"). Plugin-private DRY shared by the server renderTask (queue-backlog
// task description) and the web backlog summary so both render the oldest-overdue
// age identically. Not exported cross-plugin (lives in shared/).
export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/**
 * How long until `formatDurationMs(ms)` shows a different string, as `ms`
 * keeps growing — the next whole second under an hour, the next whole minute
 * past it. Beside the formatter on purpose: a live age re-renders exactly when
 * its text changes, so the clock that drives it must read the formatter's own
 * resolution rather than a second copy of it.
 */
export function msUntilDurationChanges(ms: number): number {
  if (ms < 1000) return 1000 - Math.max(0, ms);
  const step = ms < 3_600_000 ? 1000 : 60_000;
  return step - (ms % step);
}

/**
 * A short latency, where `formatDurationMs` would round everything under a
 * second to "0s": "12ms", "1.2s", then `formatDurationMs` from 10 s up. For the
 * pickup-delay stats, whose healthy values are milliseconds.
 */
export function formatLatencyMs(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.floor(ms))}ms`;
  if (ms < 10_000) return `${(Math.floor(ms / 100) / 10).toString()}s`;
  return formatDurationMs(ms);
}
