import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";
import type { SurfaceArrangementProps } from "@plugins/apps/core";

/**
 * The surface-arrangement region: swaps how the open tabs are laid out per the
 * global theme. `tabs` (default) renders one fullscreen tab at a time (the
 * original keep-alive surface); `desktop` lays the same `Tab[]` out as
 * free-floating windows. Pure spatial re-arrangement — no change to the tab /
 * `PaneStore` / routing lifecycle.
 *
 * Global scope (no `scope: "app"`) — the arrangement applies across every app,
 * mirroring `app-rail-framing`.
 */
export const surfaceArrangement = defineVariantRegion<SurfaceArrangementProps>({
  id: "apps-surface-arrangement",
  label: "Surface arrangement",
  defaultVariant: "tabs",
});
