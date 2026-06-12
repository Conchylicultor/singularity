/** One plugin/slot marker in the contribution chain, read off the `display:contents`
 * spans the slot-item middleware stamps onto every contribution. */
export interface UiMarker {
  pluginId: string;
  slotId?: string;
}

export interface MarkerLineage {
  /** Outer→inner plugin/slot markers from the document root down to the element.
   * The last entry is the most specific owning plugin; the whole chain is the
   * composition path (who contributes into whose slot). */
  markers: UiMarker[];
  paneId?: string;
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
      markers.unshift({ pluginId, slotId: marker.dataset.slotId || undefined });
    }
    cur = marker.parentElement;
  }
  const paneId =
    el.closest<HTMLElement>("[data-pane-id]")?.dataset.paneId || undefined;
  return { markers, paneId };
}
