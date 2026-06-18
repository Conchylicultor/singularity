import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import type { Score } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useProjection } from "./projection-context";

/**
 * Hosts every capability-compatible overlay as an absolutely-positioned layer
 * over the note grid, so overlays anchor via the published projection.
 *
 * Collection-consumer clean: filters on the GENERIC slot fields only
 * (`requires`, `annotationType`) — never names a specific overlay. Adding or
 * removing an overlay plugin changes the rendered set automatically with zero
 * edits here.
 */
export function OverlayHost({ score }: { score: Score }) {
  const overlays = Sonata.Overlay.useContributions();
  const projection = useProjection();

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed positioning context over the projection-anchored note grid; every child positions via runtime projection coordinates
    <div className="pointer-events-none absolute inset-0">
      {overlays
        .filter((o) => o.requires.every((r) => projection.capabilities.has(r)))
        .filter((o) =>
          score.annotations.some((a) => a.type === o.annotationType),
        )
        .map((o) =>
          renderIsolated("sonata.overlay", o as unknown as Contribution, {
            projection,
            annotations: score.annotations.filter(
              (a) => a.type === o.annotationType,
            ),
          }),
        )}
    </div>
  );
}
