import type { PluginDefinition } from "@core";
import { MdHistory } from "react-icons/md";
import { ConversationsView } from "@plugins/conversations/plugins/conversations-view/web";
import { HistoryView } from "./components/history-view";

export default {
  id: "conversations-history",
  name: "Conversations History",
  description: "All conversations in historical order of creation.",
  contributions: [
    ConversationsView.View({
      id: "history",
      title: "History",
      icon: MdHistory,
      order: 20,
      component: HistoryView,
    }),
  ],
} satisfies PluginDefinition;
