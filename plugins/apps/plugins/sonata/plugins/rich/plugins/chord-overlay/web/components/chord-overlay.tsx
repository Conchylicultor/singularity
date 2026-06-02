import type {
  Annotation,
  ChordData,
  Projection,
} from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Chord-symbol overlay. Anchored to the time axis only (`requires:["time-axis"]`),
 * so it works on the piano roll AND any future time-based display (falling-notes,
 * staff) without modification.
 *
 * For each `chord` annotation we place a small label at the annotation's start
 * beat, mapped to a pixel X via the display's published `projection.beatToX`.
 * Labels that fall outside the viewport are culled. Derived chords are badged
 * subtly so inferred data reads as inferred.
 */
export function ChordOverlay({
  projection,
  annotations,
}: {
  projection: Projection;
  annotations: Annotation[];
}) {
  const beatToX = projection.beatToX;
  if (!beatToX) return null; // defensive: host only mounts us with time-axis.

  const { width } = projection.viewport;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-6">
      {annotations.map((a, i) => {
        const data = a.data as ChordData;
        const x = beatToX(a.start);
        if (x < -40 || x > width + 40) return null;
        return (
          <div
            key={`${a.start}-${data.symbol}-${i}`}
            className="absolute top-0 -translate-x-1/2 rounded-b-md border border-border/60 bg-background/90 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-foreground shadow-sm backdrop-blur-sm"
            style={{ left: x }}
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
