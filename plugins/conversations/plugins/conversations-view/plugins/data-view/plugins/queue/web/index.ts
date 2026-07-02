import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLowPriority } from "react-icons/md";
import { SidebarDataView } from "@plugins/conversations/plugins/conversations-view/plugins/data-view/web";
import { SidebarQueueBody } from "./components/sidebar-queue";
import {
  QueueItemActions,
  PromoteAction,
  StepDownAction,
  DemoteAction,
  AddToQueueAction,
  CloseAction,
} from "./components/queue-item-actions";

export default {
  description:
    "Contributes the priority Queue (rebuilt on the official DataView primitive — status group-by sections, task-group aggregation, and neighbor-based manual-order drag over the queue's live data/mutation layer) as the Queue tab of the `dataview` sidebar variant.",
  contributions: [
    SidebarDataView.View({
      id: "queue",
      title: "Queue",
      icon: MdLowPriority,
      order: 5,
      component: SidebarQueueBody,
    }),
    QueueItemActions({ id: "promote", component: PromoteAction }),
    QueueItemActions({ id: "step-down", component: StepDownAction }),
    QueueItemActions({ id: "demote", component: DemoteAction }),
    QueueItemActions({ id: "add-to-queue", component: AddToQueueAction }),
    QueueItemActions({ id: "close", component: CloseAction }),
  ],
} satisfies PluginDefinition;
