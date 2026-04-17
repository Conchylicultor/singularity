import type { RightPaneDescriptor } from "@plugins/conversations/plugins/conversation-view/web/commands";
import { TasksPane } from "./components/tasks-pane";

export const TASKS_PANE_ID = "conversation.tasks-panel";

export function tasksRightPane(): RightPaneDescriptor {
  return { id: TASKS_PANE_ID, component: TasksPane };
}
