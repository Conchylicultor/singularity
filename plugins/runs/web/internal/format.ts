/**
 * Wall-clock milliseconds as something a person reads at a glance.
 *
 * Local, like the three other duration formatters in the repo (all
 * plugin-private to a debug surface). A shared `formatDuration` primitive would
 * retire all four; that is its own change, and this one does not pretend to be it.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
