import type {
  Annotation,
  ChordData,
  Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Chord-symbol overlay. Anchored to the time axis only (`requires:["time-axis"]`),
 * so it works on the (vertical) piano roll AND any future time-based display
 * without modification.
 *
 * For each `chord` annotation we place a small label at the annotation's start
 * beat, mapped to a pixel Y via the display's published `projection.beatToY`,
 * stacked down a thin band along the left edge. Labels that fall outside the
 * viewport are culled. Derived chords are badged subtly so inferred data reads
 * as inferred.
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

  const { height } = projection.viewport;

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-12">
      {annotations.map((a, i) => {
        const data = a.data as ChordData;
        const y = beatToY(a.start);
        if (y < -20 || y > height + 20) return null;
        return (
          <div
            key={`${a.start}-${data.symbol}-${i}`}
            className="absolute left-0 -translate-y-1/2 rounded-r-md border border-border/60 bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-foreground shadow-sm backdrop-blur-sm"
            style={{ top: y }}
            title={
              a.confidence !== undefined
                ? `${data.symbol} · ${(a.confidence * 100).toFixed(0)}% confidence`
                : data.symbol
            }
          >
            {data.symbol}
          </div>
        );
      })}
    </div>
  );
}
