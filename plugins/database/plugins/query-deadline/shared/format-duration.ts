// Compact human duration for report copy and the Reports list: "60s", "15 min",
// "2h 05m". Seconds up to two minutes, because the pool's default deadline is
// the number a reader recognises ("60s", not "1m 00s"); whole minutes after
// that, because the longer `withQueryDeadline` scopes are minutes-scale.
//
// Plugin-private (shared/ between this plugin's web and server) rather than
// imported: the helper sits in several plugins' own shared/ dirs already, and
// promoting one to a public barrel would make a formatting choice public API.
export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 120) return `${totalSeconds}s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 120) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}
