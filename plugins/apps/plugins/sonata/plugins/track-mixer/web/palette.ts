/**
 * Categorical track palette, sourced from the themeable `categorical-*` design
 * tokens (the same data-viz palette Gantt phases, runtime pills, and the
 * progress-bar section bands use) rather than hardcoded hexes. Each entry is a
 * raw `var(--categorical-N)` reference: the piano-roll and piano-keyboard apply
 * it as an inline `backgroundColor`, so it resolves at paint time, re-skins with
 * the active theme, and adapts to light/dark automatically. Tracks default to a
 * color by their index in `score.tracks`; the user can override per track.
 * Cycles if a score has more tracks than colors.
 */
export const TRACK_PALETTE = [
  "var(--categorical-1)",
  "var(--categorical-2)",
  "var(--categorical-3)",
  "var(--categorical-4)",
  "var(--categorical-5)",
  "var(--categorical-6)",
  "var(--categorical-7)",
  "var(--categorical-8)",
  "var(--categorical-9)",
  "var(--categorical-10)",
] as const;

/** The default color for the track at `index` (no override stored). */
export function defaultTrackColor(index: number): string {
  return TRACK_PALETTE[index % TRACK_PALETTE.length]!;
}
