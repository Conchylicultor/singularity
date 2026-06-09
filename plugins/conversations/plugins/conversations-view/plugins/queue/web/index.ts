import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLowPriority } from "react-icons/md";
import { ConversationsView } from "@plugins/conversations/plugins/conversations-view/web";
import { QueueView } from "./components/queue-view";

export default {
  description:
    "Stable-rank global priority queue of conversations awaiting user input. Ranks seeded once on creation (newest first); pinned top conversation is the user's current focus.",
  contributions: [
    ConversationsView.View({
      id: "queue",
      title: "Queue",
      icon: MdLowPriority,
      order: 5,
      component: QueueView,
    }),
  ],
} satisfies PluginDefinition;
