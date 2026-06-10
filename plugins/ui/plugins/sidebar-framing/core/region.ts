import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";
import type { SidebarFramingProps } from "@plugins/primitives/plugins/app-shell/core";

/**
 * The sidebar-framing region: swaps the whole sidebar + main wrapper shape
 * (flush / floating / inset) per app. Defaults to `flush` — pixel-identical to
 * today's app shell — until a user forks an app's theme and picks another.
 */
export const sidebarFraming = defineVariantRegion<SidebarFramingProps>({
  id: "sidebar-framing",
  label: "Sidebar framing",
  defaultVariant: "flush",
  scope: "app",
});
