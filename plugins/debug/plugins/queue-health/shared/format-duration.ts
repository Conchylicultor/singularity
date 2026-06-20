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
