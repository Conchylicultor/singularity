/**
 * Categorical track palette: distinct, saturated mid-tone hues that read on the
 * piano-roll's note chips in both light and dark mode. Tracks default to a color
 * by their index in `score.tracks`; the user can override per track. Cycles if a
 * score has more tracks than colors.
 */
export const TRACK_PALETTE = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#ef4444", // red
  "#8b5cf6", // violet
  "#84cc16", // lime
  "#f97316", // orange
  "#14b8a6", // teal
] as const;

/** The default color for the track at `index` (no override stored). */
export function defaultTrackColor(index: number): string {
  return TRACK_PALETTE[index % TRACK_PALETTE.length]!;
}
