import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useProjection } from "./projection-context";

/**
 * Hosts every capability-compatible TRANSPORT-state overlay (the A–B practice
 * loop region; future selection bands) as an absolutely-positioned layer over
 * the note grid, so each anchors via the published projection and scrolls with
 * the content. Unlike {@link OverlayHost} it is NOT annotation-gated — it
 * filters on the generic `requires` field only and each overlay reads its own
 * state via `useSonata()`.
 *
 * Collection-consumer clean: never names a specific overlay. Adding or removing
 * a transport-overlay plugin changes the rendered set automatically.
 */
export function TransportOverlayHost() {
  const overlays = Sonata.TransportOverlay.useContributions();
  const projection = useProjection();

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed positioning context over the projection-anchored note grid; each child positions via runtime projection coordinates and scrolls with the content layer
    <div className="pointer-events-none absolute inset-0">
      {overlays
        .filter((o) => o.requires.every((r) => projection.capabilities.has(r)))
        .map((o) =>
          renderIsolated(
            "sonata.transport-overlay",
            o as unknown as Contribution,
            { projection },
          ),
        )}
    </div>
  );
}
