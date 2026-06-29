import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { Projection } from "@plugins/apps/plugins/sonata/plugins/score/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * Hosts every capability-compatible TRANSPORT-EDGE overlay (the A–B loop's
 * off-screen boundary arrow chips) as an absolutely-positioned layer over the
 * note grid. Unlike {@link TransportOverlayHost} this is mounted OUTSIDE the
 * scroll layer, so its children stay pinned to the lane's top/bottom edge
 * instead of scrolling with the notes — hence it takes the published
 * `projection` as a PROP rather than reading the scroll-layer's projection
 * context. Like the overlay host it is NOT annotation-gated: it filters on the
 * generic `requires` field only and each chip reads its own transport state via
 * `useSonata()` plus the live cursor via `useCursorSelector()`.
 *
 * Collection-consumer clean: never names a specific edge indicator. Adding or
 * removing a transport-edge plugin changes the rendered set automatically.
 */
export function TransportEdgeHost({ projection }: { projection: Projection }) {
  const overlays = Sonata.TransportEdge.useContributions();

  return (
    // eslint-disable-next-line layout/no-adhoc-layout -- full-bleed positioning context over the note grid, OUTSIDE the scroll layer; each child clamps itself to a lane edge via the projection's viewport height (screen-anchored, not scroll-synced)
    <div className="pointer-events-none absolute inset-0">
      {overlays
        .filter((o) => o.requires.every((r) => projection.capabilities.has(r)))
        .map((o) =>
          renderIsolated(
            "sonata.transport-edge",
            o as unknown as Contribution,
            { projection },
          ),
        )}
    </div>
  );
}
