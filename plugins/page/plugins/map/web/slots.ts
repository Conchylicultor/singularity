import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { PageMapLayerSpec } from "../core";

/**
 * A source of map overlays derived from a page's blocks.
 *
 * `overlays` is a PURE function of the page's blocks, so layers need no hooks
 * and compose trivially. An async layer (a road route from a server call) would
 * be a new component-shaped variant beside this, not a change to it.
 */
export type PageMapLayerContribution = PageMapLayerSpec;

export const PageMap = {
  /**
   * Everything the `/map` block draws comes from here. The block runs every
   * layer and names none of them — which kind of block becomes a pin is the
   * layer's business.
   */
  Layer: defineSlot<PageMapLayerContribution>({
    docLabel: (l) => l.id,
  }),
};
