/** One plugin/slot marker in the contribution chain, read off the `display:contents`
 * spans the slot-item middleware stamps onto every contribution. */
export interface UiMarker {
  pluginId: string;
  slotId?: string;
  contributionId?: string;
}

export interface MarkerLineage {
  /** Outer→inner plugin/slot markers from the document root down to the element.
   * The last entry is the most specific owning plugin; the whole chain is the
   * composition path (who contributes into whose slot). */
  markers: UiMarker[];
  paneId?: string;
}

/** The DOM attribute a portal surface re-stamps the originating tree's full
 * outer→inner lineage onto. The `display:contents` marker spans live in the
 * source tree, but a portal relocates content to `document.body` and severs that
 * ancestry — so the lineage rides the portal-forward bridge as this serialized
 * attribute and is re-stamped on the portaled positioner. */
export const LINEAGE_ATTR = "data-plugin-lineage";

/** Append one marker to a serialized lineage (the value carried on
 * {@link LINEAGE_ATTR}). Markers with no plugin id are skipped, mirroring the DOM
 * walk's `data-plugin-id=""` skip, so the chain only ever carries real owners. */
export function appendLineage(
  serialized: string | undefined,
  marker: { pluginId: string; slotId?: string; contributionId?: string },
): string | undefined {
  if (!marker.pluginId) return serialized;
  const next: UiMarker = {
    pluginId: marker.pluginId,
    slotId: marker.slotId || undefined,
    contributionId: marker.contributionId || undefined,
  };
  return JSON.stringify([...parseLineage(serialized), next]);
}

/** Parse a serialized lineage back into markers (outer→inner). Not wrapped in a
 * try/catch: the value is always written by {@link appendLineage}, so a parse
 * failure is a real corruption we want to surface, not swallow. */
export function parseLineage(serialized: string | undefined): UiMarker[] {
  if (!serialized) return [];
  return JSON.parse(serialized) as UiMarker[];
}

/** Walk every nested `[data-plugin-id]` marker between the clicked element and the
 * document, plus the containing pane. Unlike a single `closest()`, this preserves
 * the full contribution lineage so the agent sees the composition path, not just
 * the innermost plugin. */
export function collectMarkerLineage(el: Element): MarkerLineage {
  const markers: UiMarker[] = [];
  let cur: Element | null = el;
  while (cur) {
    const marker: HTMLElement | null = cur.closest<HTMLElement>(
      "[data-plugin-id]",
    );
    if (!marker) break;
    const pluginId = marker.dataset.pluginId;
    // The middleware stamps `data-plugin-id=""` when a contribution has no plugin
    // id; skip those so the lineage only carries real owners.
    if (pluginId) {
      markers.unshift({
        pluginId,
        slotId: marker.dataset.slotId || undefined,
        contributionId: marker.dataset.contributionId || undefined,
      });
    }
    cur = marker.parentElement;
  }
  // Cross a portal boundary: a portaled positioner carries the originating tree's
  // full outer→inner lineage (the `display:contents` marker spans stayed behind in
  // the source tree, unreachable via DOM ancestry). Splice it ahead of any markers
  // collected inside the portal. Non-portaled content has no lineage host, so this
  // is a no-op and the marker-span walk above stands alone.
  const lineageHost = el.closest<HTMLElement>(`[${LINEAGE_ATTR}]`);
  if (lineageHost) {
    markers.unshift(...parseLineage(lineageHost.dataset.pluginLineage));
  }
  const paneId =
    el.closest<HTMLElement>("[data-pane-id]")?.dataset.paneId || undefined;
  return { markers, paneId };
}
