import { bars } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { Score } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Bar/measure ticks marker. The progression bar is just a beat→fraction axis;
 * we lean entirely on the score's pure `bars()` helper for the boundaries (which
 * already folds in `timeSigMap` and the pickup) so bar math lives in exactly one
 * place and can never desync from the roll or the chord analyzer.
 *
 * Each boundary becomes a thin muted tick drawn *inside* the rail (its height
 * matches the centered `h-2.5` track, so ticks read as notches in the bar rather
 * than fence posts poking out above and below it); bar numbers are labelled only
 * every Nth bar, floating in the headroom above so a long song reads as a clean
 * ruler instead of a wall of digits. The whole layer is `pointer-events-none` —
 * the scrubber owns the seek track underneath, and ticks are pure decoration
 * that clicks fall straight through.
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
            className="absolute inset-y-0 -translate-x-1/2"
            style={{ left }}
          >
            {/* Tick confined to the centered rail (h-2.5), so it sits inside the
                bar instead of overhanging it. */}
            <div className="absolute left-0 top-1/2 h-2.5 w-px -translate-y-1/2 bg-muted-foreground/40" />
            {showLabel && (
              // eslint-disable-next-line text/no-adhoc-typography -- tight leading keeps the compact tick number aligned to the rail tick; text-3xs carries no line-height of its own
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
