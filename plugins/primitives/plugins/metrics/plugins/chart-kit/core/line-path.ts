/** A plotted point; `null` is a gap. */
export type PlotPoint = { x: number; y: number } | null;

/** The pieces one line series draws. */
export interface LinePaths {
  /** Every segment between two present points not touching a partial bucket. */
  solid: string;
  /** The segments into or out of a partial bucket (drawn dashed). */
  dashed: string;
  /**
   * Indexes of present points with no present neighbour. A path through them
   * draws nothing, so they get a marker instead — a lone value never vanishes.
   */
  isolated: number[];
  /** Runs of consecutive present points, for the area wash under the line. */
  runs: number[][];
}

/**
 * Split a series' points into the paths it draws. A `null` point breaks the
 * line (a gap, never a drop to zero); a segment touching a partial bucket goes
 * to `dashed` so the still-filling bucket reads as provisional.
 */
export function linePaths(
  points: readonly PlotPoint[],
  partial: (i: number) => boolean,
): LinePaths {
  let solid = "";
  let dashed = "";
  // The last point each path ended on, so a contiguous segment continues the
  // path (keeping its round join) instead of starting a new subpath.
  let solidEnd = -1;
  let dashedEnd = -1;
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push(i);
    const prev = i > 0 ? points[i - 1] : null;
    if (!prev) continue;
    const seg = `${p.x},${p.y}`;
    if (partial(i) || partial(i - 1)) {
      dashed += dashedEnd === i - 1 ? `L${seg}` : `M${prev.x},${prev.y}L${seg}`;
      dashedEnd = i;
    } else {
      solid += solidEnd === i - 1 ? `L${seg}` : `M${prev.x},${prev.y}L${seg}`;
      solidEnd = i;
    }
  }
  if (run.length) runs.push(run);
  const isolated = runs.filter((r) => r.length === 1).map((r) => r[0]!);
  return { solid, dashed, isolated, runs };
}

/** The closed area under one run of points, down to `baseY`. */
export function areaPath(
  points: readonly PlotPoint[],
  run: readonly number[],
  baseY: number,
): string {
  const pts = run.flatMap((i) => points[i] ?? []);
  if (pts.length < 2) return "";
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const line = pts.map((p, k) => `${k ? "L" : "M"}${p.x},${p.y}`).join("");
  return `${line}L${last.x},${baseY}L${first.x},${baseY}Z`;
}
