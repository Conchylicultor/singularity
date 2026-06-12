import { bars } from "@plugins/apps/plugins/sonata/plugins/score/core";
import type { Score } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { railBandClass } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";

/**
 * Bar/measure ticks marker. The progression bar is just a beat→fraction axis;
 * we lean entirely on the score's pure `bars()` helper for the boundaries (which
 * already folds in `timeSigMap` and the pickup) so bar math lives in exactly one
 * place and can never desync from the roll or the chord analyzer.
 *
 * Each boundary becomes a thin muted tick drawn *inside* the rail (its height
 * matches the centered `h-2.5` track, so ticks read as notches in the bar rather
 * than fence posts poking out above and below it), so a long song reads as a
 * clean ruler rather than a wall of digits — the ticks carry the cadence without
 * any numbering. The whole layer is `pointer-events-none` — the scrubber owns the
 * seek track underneath, and ticks are pure decoration that clicks fall straight
 * through.
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

  return (
    <div className="pointer-events-none absolute inset-0">
      {boundaries.map(({ index, startBeat }) => {
        const left = `${beatToFraction(startBeat) * 100}%`;
        return (
          <div
            key={index}
            className="absolute inset-y-0 -translate-x-1/2"
            style={{ left }}
          >
            {/* Tick confined to the shared rail band, so it sits inside the bar
                instead of overhanging it — and stays aligned with the key bars,
                which compose the same band. */}
            <div className={`${railBandClass} left-0 w-px bg-muted-foreground/40`} />
          </div>
        );
      })}
    </div>
  );
}
