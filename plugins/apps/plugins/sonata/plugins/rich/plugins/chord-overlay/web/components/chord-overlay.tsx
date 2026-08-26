import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";
import { useMemo } from "react";
import {
  effectiveKeyAt,
  type Annotation,
  type ChordData,
  type Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { formatChordLabel } from "@plugins/apps/plugins/sonata/plugins/theory/core";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useChordDisplayMode } from "@plugins/apps/plugins/sonata/plugins/rich/plugins/chord-label/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";

/**
 * Chord-symbol overlay. Anchored to the time axis only (`requires:["time-axis"]`),
 * so it works on the (vertical) piano roll AND any future time-based display
 * without modification.
 *
 * For each `chord` annotation we place a small label at the annotation's start
 * beat, mapped to a pixel Y via the display's published `projection.beatToY`,
 * stacked down a thin band along the left edge. The Y axis is content-space and
 * we render inside the display's translated scroll layer, so every label is
 * drawn once and the lane's `overflow-hidden` clips whatever scrolls offscreen.
 * Derived chords are badged subtly so inferred data reads as inferred.
 *
 * The visible text follows the shared chord-label mode (`symbol` / `roman` /
 * `both`) via `formatChordLabel`, resolved against the key in force at each
 * chord's onset — so the overlay and the progression strip label chords in
 * lockstep. The `title` tooltip keeps the raw symbol + spelling + confidence.
 */
export function ChordOverlay({
  projection,
  annotations,
}: {
  projection: Projection;
  annotations: Annotation[];
}) {
  const { score } = useSonata();
  const mode = useChordDisplayMode();
  const beatToY = projection.beatToY;

  // Displayed label per annotation, keyed by the stable annotation reference so
  // chips read it by identity. Recomputes only when the annotations, the score
  // (key context) or the mode changes — never per playback frame.
  const labels = useMemo(
    () =>
      new Map(
        annotations.map((a) => [
          a,
          formatChordLabel(
            a.data as ChordData,
            effectiveKeyAt(score, a.start) ?? null,
            mode,
          ),
        ]),
      ),
    [annotations, score, mode],
  );

  if (!beatToY) return null; // defensive: host only mounts us with time-axis.

  return (
    <Pin to="left" stretch decorative layer="float" className="w-12">
      {annotations.map((a, i) => {
        const data = a.data as ChordData;
        const y = beatToY(a.start);
        return (
          // Centered on a runtime-computed pixel Y from beatToY — a measured
          // coordinate, not a ramp offset.
          <Placed
            key={`${a.start}-${data.symbol}-${i}`}
            x={{ start: 0 }}
            y={{ center: y }}
            // eslint-disable-next-line text/no-adhoc-typography -- leading-none keeps this compact chord chip on a single line
            className="rounded-r-md border border-border/60 bg-background/90 px-xs py-2xs text-2xs font-semibold leading-none text-foreground shadow-sm backdrop-blur-sm"
            title={(() => {
              const name = data.spelledSymbol
                ? `${data.symbol} (${data.spelledSymbol})`
                : data.symbol;
              return a.confidence !== undefined
                ? `${name} · ${(a.confidence * 100).toFixed(0)}% confidence`
                : name;
            })()}
          >
            {labels.get(a)}
          </Placed>
        );
      })}
    </Pin>
  );
}
