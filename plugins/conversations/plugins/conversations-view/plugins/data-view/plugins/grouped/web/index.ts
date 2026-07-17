import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdGroupWork } from "react-icons/md";
import { SidebarDataView } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import { SidebarGroupedBody } from "./components/sidebar-grouped";
import {
  GroupedItemActions,
  RemoveFromGroupAction,
  DeleteGroupAction,
  CloseAction,
} from "./components/grouped-item-actions";

export default {
  description:
    "Contributes the user-defined conversation Groups (rebuilt on the official DataView primitive as a tree — group → conversations, both ranked, over the grouped plugin's live data/mutation layer) as the Grouped tab of the `dataview` sidebar variant.",
  contributions: [
    SidebarDataView.View({
      id: "grouped",
      title: "Grouped",
      icon: MdGroupWork,
      // Between queue (5) and history (10) — classic's Queue/Grouped/History order.
      order: 8,
      component: SidebarGroupedBody,
    }),
    GroupedItemActions({ id: "remove-from-group", component: RemoveFromGroupAction }),
    GroupedItemActions({ id: "delete-group", component: DeleteGroupAction }),
    GroupedItemActions({ id: "close", component: CloseAction }),
  ],
} satisfies PluginDefinition;
