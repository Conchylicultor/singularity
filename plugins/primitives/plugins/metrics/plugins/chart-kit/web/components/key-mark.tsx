import type { ReactNode } from "react";
import { CHART } from "../internal/tokens";

/** How a legend / tooltip row keys its series: the mark's own shape. */
export type KeyShape = "rect" | "line" | "dash" | "none";

/**
 * The small coloured mark that carries a series' identity beside its (never
 * coloured) text: a rounded square for bars and areas, a 2px stroke for lines,
 * a dashed neutral stroke for the compare line, or an empty slot that keeps a
 * row aligned with its keyed neighbours.
 */
export function KeyMark({
  shape,
  color,
}: {
  shape: KeyShape;
  color?: string;
}): ReactNode {
  return (
    <svg width={12} height={10} aria-hidden="true" className="block">
      {shape === "rect" && (
        <rect x={1} y={0} width={10} height={10} rx={3} fill={color} />
      )}
      {shape === "line" && (
        <line
          x1={1}
          x2={11}
          y1={5}
          y2={5}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      {shape === "dash" && (
        <line
          x1={0}
          x2={12}
          y1={5}
          y2={5}
          stroke={color ?? CHART.compare}
          strokeWidth={2}
          strokeDasharray="3 2"
        />
      )}
    </svg>
  );
}
