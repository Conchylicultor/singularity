import type { CSSProperties } from "react";

/**
 * The hatched look for a stretch the machine was not observing or not running
 * — a sampler void on the Timeline, a nap inside an op's span. A distinct
 * visual class, not a severity color: a diagonal hatch drawn from
 * `currentColor` so it stays theme-driven, unambiguous from both a transparent
 * (healthy) track and any fill. Spread both halves onto the painted box:
 * `className={HATCH_CLASS} style={HATCH_STYLE}`.
 */
export const HATCH_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, currentColor 0, currentColor 2px, transparent 2px, transparent 6px)",
};

/** The hatch's ink: the `currentColor` the stripes are drawn in. */
export const HATCH_CLASS = "text-muted-foreground/60";
