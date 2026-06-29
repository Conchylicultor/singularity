import { defineVariantRegionWeb } from "@plugins/ui/plugins/variant-region/web";
import { conversationsSidebarRegion } from "../core";

/**
 * The web half of the conversation-sidebar region. `SidebarRegion.Variant` is
 * the slot each variant sub-plugin (`classic`, future `dataview`) contributes
 * to; `conversationsSidebarRegionWeb.Region` / `.Picker` are rendered by the
 * mount point (`conversations-view`) — this region owns no slot of its own.
 */
export const conversationsSidebarRegionWeb = defineVariantRegionWeb(
  conversationsSidebarRegion,
);

export const SidebarRegion = {
  Variant: conversationsSidebarRegionWeb.Variant,
};
