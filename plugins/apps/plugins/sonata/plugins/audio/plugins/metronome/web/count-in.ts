import type { Score } from "@plugins/apps/plugins/sonata/plugins/score/core";

/** The time signature in force at `atBeat` (defaults to 4/4 when none is set). */
export function meterAt(
  score: Score,
  atBeat: number,
): { numerator: number; denominator: number } {
  let numerator = 4;
  let denominator = 4;
  // timeSigMap is ascending by beat; take the last change at or before atBeat.
  for (const sig of score.timeSigMap) {
    if (sig.beat <= atBeat) {
      numerator = sig.numerator;
      denominator = sig.denominator;
    }
  }
  return { numerator, denominator };
}

/** One lead-in click, positioned relative to the lead-in's start. */
export interface CountInClick {
  /** Offset from the lead-in start, in quarter-note beats. */
  offsetQuarters: number;
  /** True on the first beat of each bar (the accented downbeat). */
  accent: boolean;
}

export interface CountInPlan {
  /** Total lead-in length in quarter-note beats (the provider's return value). */
  totalQuarters: number;
  /** One entry per click, first → last. */
  clicks: CountInClick[];
}

/**
 * The count-in (lead-in) click plan: `bars × numerator` clicks at the meter in
 * force at `atBeat`, ending exactly at `atBeat`. One click per notated beat,
 * spaced `quarterPerBeat = 4 / denominator` quarter-beats apart, with the first
 * click of each bar accented. Pure.
 */
export function computeCountInPlan(
  score: Score,
  atBeat: number,
  bars: number,
): CountInPlan {
  const { numerator, denominator } = meterAt(score, atBeat);
  const quarterPerBeat = 4 / denominator;
  const totalClicks = bars * numerator;

  const clicks: CountInClick[] = Array.from(
    { length: totalClicks },
    (_, i) => ({
      offsetQuarters: i * quarterPerBeat,
      accent: i % numerator === 0,
    }),
  );

  return { totalQuarters: totalClicks * quarterPerBeat, clicks };
}
