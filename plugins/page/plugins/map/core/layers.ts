import type { MapOverlay } from "@plugins/map/core";

/**
 * One overlay a page-map layer derived, with the block it stands for. `blockId`
 * is how a pin click finds its way back to page content without the map knowing
 * what a block is; a layer drawing something that is not one block omits it.
 */
export interface PageMapOverlay {
  overlay: MapOverlay;
  blockId?: string;
}

/**
 * What a layer derives from a page's blocks. `unplaced` counts the items this
 * layer is responsible for but cannot draw yet (no coordinates): the block says
 * so under the map, because dropping them silently would make the map lie about
 * the page.
 */
export interface PageMapLayerResult {
  overlays: PageMapOverlay[];
  unplaced: number;
}
