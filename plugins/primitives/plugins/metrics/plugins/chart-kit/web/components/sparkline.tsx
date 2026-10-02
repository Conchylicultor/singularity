import type { ReactNode } from "react";
import { categoricalColor, linePaths, type ChartValue } from "../../core";
import { CHART } from "../internal/tokens";

export interface SparklineProps {
  values: readonly ChartValue[];
  /** The end dot's colour (the current value). Default the first categorical slot. */
  color?: string;
  width?: number;
  height?: number;
}

/**
 * A tile's trend: a de-emphasised line with the current (last present) value
 * as a dot in `color`. Decorative — the tile states the number — so it is
 * hidden from assistive tech. Gaps stay gaps; a flat or single-value series
 * sits on the midline.
 */
export function Sparkline({
  values,
  color = categoricalColor(0),
  width = 84,
  height = 28,
}: SparklineProps): ReactNode {
  const present = values.filter((v) => v !== null);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const n = values.length;
  const X = (i: number) =>
    n > 1 ? 2 + (i / (n - 1)) * (width - 6) : width / 2;
  const Y = (v: number) =>
    hi > lo ? height - 3 - ((v - lo) / (hi - lo)) * (height - 7) : height / 2;
  const points = values.map((v, i) =>
    v === null ? null : { x: X(i), y: Y(v) },
  );
  const lp = linePaths(points, () => false);
  let last = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (values[i] !== null && values[i] !== undefined) {
      last = i;
      break;
    }
  }
  const end = last >= 0 ? points[last] : null;
  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      className="block"
      data-sparkline=""
    >
      {lp.solid && (
        <path
          d={lp.solid}
          fill="none"
          stroke={CHART.trend}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
      {end && (
        <circle
          cx={end.x}
          cy={end.y}
          r={3}
          fill={color}
          stroke={CHART.surface}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
