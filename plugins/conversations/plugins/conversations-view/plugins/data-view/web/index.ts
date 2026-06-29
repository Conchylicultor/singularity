import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SidebarRegion } from "@plugins/conversations/plugins/conversations-view/plugins/sidebar-region/web";
import {
  SidebarDataViewBody,
  HistoryItemActions,
  CloseConvAction,
} from "./components/sidebar-history";

export default {
  description:
    "Registers the sidebar History list as a server-delegated DataView (the `dataview` conversation-list variant), reusing the all-conversations query infra.",
  contributions: [
    SidebarRegion.Variant({
      id: "dataview",
      label: "DataView",
      match: "dataview",
      component: SidebarDataViewBody,
    }),
    HistoryItemActions({ id: "close", component: CloseConvAction }),
  ],
} satisfies PluginDefinition;
