import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { NewChildTaskAction } from "./components/new-child-task-action";

export default {
  id: "conversation-new-child-task",
  name: "Conversation: New child task",
  description:
    "Toolbar button that opens a popover to create a child task under the conversation's parent task.",
  contributions: [Conversation.ActionBar({ component: NewChildTaskAction })],
} satisfies PluginDefinition;
