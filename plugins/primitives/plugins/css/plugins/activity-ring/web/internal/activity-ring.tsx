import type { ReactNode } from "react";
import {
  cn,
  useControlSize,
  type ControlSize,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/** What the background work a ring reports is doing. */
export type ActivityState = "running" | "failed";

/** One piece of background work: its state, and how a person reads it ("Building"). */
export interface Activity {
  state: ActivityState;
  label: string;
}

export interface ActivityRingProps {
  /** `null`: nothing to report — the child renders alone, no box reserved. */
  state: ActivityState | null;
  children: ReactNode;
}

/** Ring box per density tier: 2.75× the status dot of the same tier (22px
 * around the md tier's 8px dot). */
const SIZE_MAP: Record<ControlSize, string> = {
  xs: "size-[calc(var(--status-dot-xs)*2.75)]",
  sm: "size-[calc(var(--status-dot-sm)*2.75)]",
  md: "size-[calc(var(--status-dot-md)*2.75)]",
  lg: "size-[calc(var(--status-dot-lg)*2.75)]",
};

// Drawn on a 22-unit grid (one unit = 1px at the md tier); the stroke sits
// inside the box.
const C = 11;
const R = 9.5;
const STROKE = 1.6;

/**
 * A ring around `children` (a status dot), centred on it. The ring is an
 * absolutely-positioned SVG over a box of its own diameter, so the dot inside
 * never moves or resizes when the ring comes and goes — only the box around it
 * appears.
 */
export function ActivityRing({ state, children }: ActivityRingProps) {
  const size = useControlSize();
  if (state === null) return children;
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center align-middle",
        SIZE_MAP[size],
      )}
    >
      <svg
        viewBox="0 0 22 22"
        aria-hidden
        fill="none"
        strokeWidth={STROKE}
        className={cn(
          "absolute inset-0 size-full",
          state === "running" && "animate-spin motion-reduce:animate-none",
        )}
      >
        {state === "running" ? (
          <>
            {/* The track: the surface's hover tone, faint against the bar. */}
            <circle cx={C} cy={C} r={R} className="stroke-hover-fill" />
            {/* A quarter arc from twelve o'clock, in the text colour. */}
            <path
              d={`M${C} ${C - R}a${R} ${R} 0 0 1 ${R} ${R}`}
              strokeLinecap="round"
              className="stroke-foreground"
            />
          </>
        ) : (
          // Broken: short butt-ended dashes all the way round.
          <circle
            cx={C}
            cy={C}
            r={R}
            strokeDasharray="3.2 2.6"
            className="stroke-destructive-solid"
          />
        )}
      </svg>
      {children}
    </span>
  );
}
