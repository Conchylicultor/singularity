import { defineVariantRegionWeb } from "@plugins/ui/plugins/variant-region/web";
import { sidebarFraming } from "../core";

/**
 * The web half of the sidebar-framing region. `SidebarFraming.Variant` is the
 * slot each variant sub-plugin (flush/floating/inset) contributes to;
 * `sidebarFramingWeb.Region` is the host contributed into `AppShell.Framing`.
 */
export const sidebarFramingWeb = defineVariantRegionWeb(sidebarFraming);

export const SidebarFraming = {
  Variant: sidebarFramingWeb.Variant,
};
