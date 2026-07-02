import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHistory } from "react-icons/md";
import { SidebarDataView } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import {
  SidebarDataViewBody,
  HistoryItemActions,
  CloseConvAction,
} from "./components/sidebar-history";

export default {
  description:
    "Contributes the History list (a server-delegated DataView reusing the all-conversations query infra) as the History tab of the `dataview` sidebar variant.",
  contributions: [
    SidebarDataView.View({
      id: "history",
      title: "History",
      icon: MdHistory,
      order: 10,
      component: SidebarDataViewBody,
    }),
    HistoryItemActions({ id: "close", component: CloseConvAction }),
  ],
} satisfies PluginDefinition;
