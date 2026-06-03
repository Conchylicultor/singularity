import { bars } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { Score } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Bar/measure ticks marker. The progression bar is just a beat→fraction axis;
 * we lean entirely on the score's pure `bars()` helper for the boundaries (which
 * already folds in `timeSigMap` and the pickup) so bar math lives in exactly one
 * place and can never desync from the roll or the chord analyzer.
 *
 * Each boundary becomes a thin muted tick; bar numbers are labelled only every
 * Nth bar so a long song reads as a clean ruler instead of a wall of digits.
 * The whole layer is `pointer-events-none` — the scrubber owns the seek track
 * underneath, and ticks are pure decoration that clicks fall straight through.
 */
export function BarTicks({
  score,
  beatToFraction,
}: {
  score: Score;
  beatToFraction: (beat: number) => number;
}) {
  const boundaries = bars(score);

  // `bars()` always returns at least the implicit 4/4 bar 0, so gate on real
  // content instead of the array length — an empty score gets no ruler.
  if (
    boundaries.length === 0 ||
    (score.notes.length === 0 && score.annotations.length === 0)
  ) {
    return null;
  }

  // Adaptive label cadence: dense ruler → sparse labels, so they never collide.
  const labelEvery =
    boundaries.length > 64 ? 8 : boundaries.length > 32 ? 4 : 1;

  return (
    <div className="pointer-events-none absolute inset-0">
      {boundaries.map(({ index, startBeat }) => {
        const left = `${beatToFraction(startBeat) * 100}%`;
        const showLabel = index % labelEvery === 0;
        return (
          <div
            key={index}
            className="absolute inset-y-0 w-px -translate-x-1/2 bg-muted-foreground/40"
            style={{ left }}
          >
            {showLabel && (
              <span className="absolute left-1 top-0 text-3xs leading-none text-muted-foreground tabular-nums">
                {index + 1}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
