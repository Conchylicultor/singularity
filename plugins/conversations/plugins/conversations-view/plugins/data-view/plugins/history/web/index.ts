import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHistory } from "react-icons/md";
import { SidebarSources } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import {
  HistorySource,
  HistoryItemActions,
  CloseConvAction,
} from "./components/sidebar-history";

export default {
  description:
    "Contributes the History list (a server-delegated bundle reusing the all-conversations query infra) as the History source of the merged conversation-sidebar DataView.",
  contributions: [
    SidebarSources({
      id: "history",
      title: "History",
      icon: MdHistory,
      order: 10,
      views: ["list"],
      component: HistorySource,
    }),
    HistoryItemActions({ id: "close", component: CloseConvAction }),
  ],
} satisfies PluginDefinition;
