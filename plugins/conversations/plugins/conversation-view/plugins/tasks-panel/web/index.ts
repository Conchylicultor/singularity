import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { TasksButton } from "./components/tasks-button";

const tasksPanelPlugin: PluginDefinition = {
  id: "conversation-tasks-panel",
  name: "Conversation: Tasks panel",
  description:
    "Toolbar button that opens a right pane showing the task tree (active task + children) and the task detail.",
  contributions: [Conversation.Toolbar({ component: TasksButton })],
};

export default tasksPanelPlugin;
