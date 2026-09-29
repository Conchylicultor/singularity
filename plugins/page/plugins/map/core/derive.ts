import type { Block } from "@plugins/page/plugins/editor/core";
import type { MapOverlay } from "@plugins/map/core";
import type { PageMapLayerResult } from "./layers";

/** The pure half of a `PageMap.Layer` contribution. */
export interface PageMapLayerSpec {
  id: string;
  overlays: (blocks: readonly Block[]) => PageMapLayerResult;
  describeUnplaced: (count: number) => string;
  emptyHint?: string;
}

export interface PageMapView {
  /** Every layer's overlays, ids namespaced by layer so two layers cannot collide. */
  overlays: MapOverlay[];
  /** Namespaced overlay id → the block it stands for. */
  blockIdOf: ReadonlyMap<string, string>;
  /** One line per layer with unplaced items, in layer order. */
  unplacedNotes: string[];
  /** What each layer suggests adding when the map is empty. */
  emptyHints: string[];
}

/**
 * Run every layer over ONE page's blocks. `blocks` is the editor's flat list,
 * which also holds inline-expanded sub-pages' rows; keeping `pageId` is what
 * makes the map show this page and not its children's.
 */
export function derivePageMap(
  blocks: readonly Block[],
  pageId: string | null,
  layers: readonly PageMapLayerSpec[],
): PageMapView {
  const own = blocks.filter((b) => b.pageId === pageId);
  const overlays: MapOverlay[] = [];
  const blockIdOf = new Map<string, string>();
  const unplacedNotes: string[] = [];
  const emptyHints: string[] = [];

  for (const layer of layers) {
    const result = layer.overlays(own);
    for (const { overlay, blockId } of result.overlays) {
      const id = `${layer.id}:${overlay.id}`;
      overlays.push({ ...overlay, id });
      if (blockId !== undefined) blockIdOf.set(id, blockId);
    }
    if (result.unplaced > 0) {
      unplacedNotes.push(layer.describeUnplaced(result.unplaced));
    }
    if (layer.emptyHint !== undefined) emptyHints.push(layer.emptyHint);
  }

  return { overlays, blockIdOf, unplacedNotes, emptyHints };
}
