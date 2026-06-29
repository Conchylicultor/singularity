import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SidebarRegion } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/web";
import { ClassicBody } from "./components/classic-body";

export default {
  description:
    "Registers today's tabbed Queue/Grouped/History conversation list as the `classic` sidebar variant (the default, and the only variant in Phase 0).",
  contributions: [
    SidebarRegion.Variant({
      id: "classic",
      label: "Classic",
      match: "classic",
      component: ClassicBody,
    }),
  ],
} satisfies PluginDefinition;
