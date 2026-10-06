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

/** Ring diameter per density tier: 2.5× the status dot of the same tier. */
const SIZE_MAP: Record<ControlSize, string> = {
  xs: "size-[calc(var(--status-dot-xs)*2.5)]",
  sm: "size-[calc(var(--status-dot-sm)*2.5)]",
  md: "size-[calc(var(--status-dot-md)*2.5)]",
  lg: "size-[calc(var(--status-dot-lg)*2.5)]",
};

// Drawn on a 20-unit grid; the stroke sits inside the box.
const R = 8.6;
const STROKE = 1.8;
const CIRCUMFERENCE = 2 * Math.PI * R;

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
        viewBox="0 0 20 20"
        aria-hidden
        className={cn(
          "absolute inset-0 size-full",
          state === "running" && "animate-spin motion-reduce:animate-none",
        )}
      >
        {state === "running" ? (
          <>
            <circle
              cx="10"
              cy="10"
              r={R}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-muted-foreground/30"
            />
            <circle
              cx="10"
              cy="10"
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE * 0.28} ${CIRCUMFERENCE}`}
              transform="rotate(-90 10 10)"
              className="stroke-foreground"
            />
          </>
        ) : (
          <circle
            cx="10"
            cy="10"
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE / 8 - 2.4} 2.4`}
            transform="rotate(-90 10 10)"
            className="stroke-destructive"
          />
        )}
      </svg>
      {children}
    </span>
  );
}
