import type { TimelineWindow } from "./view-model";

// ---------------------------------------------------------------------------
// Wall-clock axis ticks. The GanttContainer's built-in TimeAxis is
// window-relative (offsets from 0); this derives the absolute HH:MM tick row
// rendered underneath it. Pure — co-located bun tests.
// ---------------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 3_600_000;

// Nice wall-clock steps, ascending. 12h caps the ramp (24h lookback / 8 ≈ 3h).
const NICE_STEPS = [
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
];

export interface WallclockTick {
  /** Window-relative ms (feed toLeftPct). */
  relMs: number;
  /** Local HH:MM. */
  label: string;
}

/** Smallest nice step yielding at most `targetCount` ticks over the span. */
export function pickTickStep(spanMs: number, targetCount = 8): number {
  for (const step of NICE_STEPS) {
    if (spanMs / step <= targetCount) return step;
  }
  return NICE_STEPS[NICE_STEPS.length - 1]!;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local wall-clock label for an epoch-ms instant. */
export function formatWallclock(
  ms: number,
  opts?: { seconds?: boolean },
): string {
  const d = new Date(ms);
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return opts?.seconds ? `${base}:${pad(d.getSeconds())}` : base;
}

/**
 * Absolute ticks across the window at step-aligned instants (epoch-aligned,
 * so a 5m step lands on :00/:05/:10 …), returned window-relative for the
 * Gantt's % mapping.
 */
export function wallclockTicks(
  range: TimelineWindow,
  targetCount = 8,
): WallclockTick[] {
  const step = pickTickStep(range.toMs - range.fromMs, targetCount);
  const first = Math.ceil(range.fromMs / step) * step;
  const out: WallclockTick[] = [];
  for (let t = first; t <= range.toMs; t += step) {
    out.push({ relMs: t - range.fromMs, label: formatWallclock(t) });
  }
  return out;
}
