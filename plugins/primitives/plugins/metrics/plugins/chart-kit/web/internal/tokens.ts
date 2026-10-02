/**
 * The theme tokens chart chrome is drawn in. Marks take the series' own colour
 * (categorical slots); everything here is neutral or status, and no text ever
 * wears a series colour.
 */
export const CHART = {
  /** Gridlines: one step off the surface, hairline, solid. */
  grid: "var(--border)",
  /** The zero line and the hover crosshair: a step stronger than the grid. */
  axis: "var(--faint-foreground)",
  /** The previous-period line. */
  compare: "var(--muted-foreground)",
  /** The hover band behind a bar column. */
  hover: "var(--hover-fill)",
  /** The 2px ring around markers — the surface a chart sits on (a card). */
  surface: "var(--card)",
  /** `net` bars above zero. */
  positive: "var(--success)",
  /** `net` bars below zero. */
  negative: "var(--destructive)",
  /** The sparkline's trend line (de-emphasised). */
  trend: "var(--muted-foreground)",
} as const;

/** Mark specs shared by every chart (dataviz: marks-and-anatomy). */
export const MARK = {
  /** Bars are at most this wide; the rest of the band is air. */
  maxBar: 24,
  /** The rounded data end of a bar. */
  radius: 4,
  /** The surface gap between stacked segments. */
  stackGap: 2,
  /** Mirror / net bars sit this far off their zero line. */
  zeroGap: 1,
  line: 2,
  marker: 4,
  ring: 2,
  /** Area wash under a line. */
  areaOpacity: 0.1,
  /** Bars other than the hovered one. */
  dimOpacity: 0.55,
  /** A partial (still filling) bucket's bar. */
  partialOpacity: 0.45,
  /** A segment into a partial bucket. */
  partialDash: "3 3",
  /** The previous-period line. */
  compareDash: "4 4",
  compareWidth: 1.5,
  /** One x label per this many px at most. */
  labelSpacing: 78,
} as const;

/** Show every `labelEvery(n, width)`-th x label so labels never collide. */
export function labelEvery(n: number, width: number): number {
  return Math.max(
    1,
    Math.ceil(n / Math.max(2, Math.floor(width / MARK.labelSpacing))),
  );
}

/** The class every axis tick label wears (text tokens, tabular figures). */
export const TICK_CLASS = "text-caption fill-muted-foreground tabular-nums";
