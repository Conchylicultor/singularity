// Compact human duration ("1h 10m", "2m 03s", "45s") for the report copy.
//
// Plugin-private rather than imported: `shared/` is plugin-private by the
// boundary rules, and queue-health's identical helper lives in its own
// `shared/`. Promoting one to a cross-plugin barrel would make a formatting
// choice part of a plugin's public API for no caller's benefit.
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
