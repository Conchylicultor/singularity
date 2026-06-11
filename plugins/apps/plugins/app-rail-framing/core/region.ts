import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";
import type { RailFramingProps } from "@plugins/apps/core";

/**
 * The app-rail framing region: swaps the far-left app-switcher rail per the
 * global theme. `rail` (default) renders the icon rail and reserves
 * `--app-rail-width: 2.5rem`; `hidden` removes the rail and drives the var to
 * `0` so the sidebar slides flush to the viewport edge.
 *
 * Global scope (no `scope: "app"`) — the rail is the first global variant
 * region, so the choice applies across every app.
 */
export const appRailFraming = defineVariantRegion<RailFramingProps>({
  id: "app-rail-framing",
  label: "App rail",
  defaultVariant: "rail",
});
