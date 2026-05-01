import type { PluginDefinition } from "@core";
import { MdLowPriority } from "react-icons/md";
import { ConversationsView } from "@plugins/conversations/plugins/conversations-view/web";
import { QueueView } from "./components/queue-view";

export default {
  id: "conversations-queue",
  name: "Conversations Queue",
  description:
    "Anki-style global priority queue of conversations awaiting user input. Top of the deck is what to do next; finishing a turn returns the conversation to position 2 so the top stays stable.",
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
