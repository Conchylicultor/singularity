import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * Hosts every capability-compatible pitch-axis decoration (the piano keyboard,
 * future fretboards, pitch rulers) in the roll's bottom gutter, passing the
 * published projection so each anchors via `projection.keys` / `pitchToX`.
 *
 * Collection-consumer clean: filters on the GENERIC `requires` field only —
 * never names a specific contributor. Adding or removing a pitch-axis plugin
 * changes the rendered set automatically with zero edits here.
 */
export function PitchAxisHost({ projection }: { projection: Projection }) {
  const decorations = Sonata.PitchAxis.useContributions();

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed positioning context over the pitch-axis gutter; each decoration anchors via runtime projection coordinates (projection.keys / pitchToX)
    <div className="absolute inset-0">
      {decorations
        .filter((d) => d.requires.every((r) => projection.capabilities.has(r)))
        .map((d) =>
          renderIsolated("sonata.pitch-axis", d as unknown as Contribution, {
            projection,
          }),
        )}
    </div>
  );
}
