import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { NewChildTaskAction } from "./components/new-child-task-action";

export default {
  id: "conversation-new-child-task",
  name: "Conversation: New child task",
  description:
    "Toolbar button that opens a popover to create a child task under the conversation's parent task.",
  contributions: [conversationPane.Actions({ component: NewChildTaskAction })],
} satisfies PluginDefinition;
