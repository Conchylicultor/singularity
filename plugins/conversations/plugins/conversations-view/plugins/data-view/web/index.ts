import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SidebarRegion } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/web";
import { DataViewBody } from "./components/dataview-body";

export { SidebarDataView } from "./host";

export default {
  description:
    "Umbrella for the `dataview` conversation-list sidebar variant: owns the tab host and registers the variant. Per-tab sub-plugins (History, Queue) contribute their tab into SidebarDataView.View.",
  contributions: [
    SidebarRegion.Variant({
      id: "dataview",
      label: "DataView",
      match: "dataview",
      component: DataViewBody,
    }),
  ],
} satisfies PluginDefinition;
