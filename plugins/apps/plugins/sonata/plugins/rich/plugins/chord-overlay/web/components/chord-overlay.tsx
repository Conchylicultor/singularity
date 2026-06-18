import type {
  Annotation,
  ChordData,
  Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
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
 */
export function ChordOverlay({
  projection,
  annotations,
}: {
  projection: Projection;
  annotations: Annotation[];
}) {
  const beatToY = projection.beatToY;
  if (!beatToY) return null; // defensive: host only mounts us with time-axis.

  return (
    <Pin to="left" stretch decorative layer="float" className="w-12">
      {annotations.map((a, i) => {
        const data = a.data as ChordData;
        const y = beatToY(a.start);
        return (
          <div
            key={`${a.start}-${data.symbol}-${i}`}
            // eslint-disable-next-line text/no-adhoc-typography, layout/no-adhoc-layout -- tight leading keeps this compact chord chip a single line (size via the text-2xs sub-scale); positioned at a runtime-computed pixel Y (style={{ top: beatToY(a.start) }}), so -translate-y-1/2 centers on that JS coordinate, not a ramp offset
            className="absolute left-0 -translate-y-1/2 rounded-r-md border border-border/60 bg-background/90 px-xs py-2xs text-2xs font-semibold leading-none text-foreground shadow-sm backdrop-blur-sm"
            style={{ top: y }}
            title={(() => {
              const name = data.spelledSymbol
                ? `${data.symbol} (${data.spelledSymbol})`
                : data.symbol;
              return a.confidence !== undefined
                ? `${name} · ${(a.confidence * 100).toFixed(0)}% confidence`
                : name;
            })()}
          >
            {data.symbol}
          </div>
        );
      })}
    </Pin>
  );
}
