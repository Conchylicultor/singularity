import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { MdChecklist } from "react-icons/md";
import {
  tasksRootPane,
  taskDetailPane,
  taskConversationPane,
} from "./panes";

export { TaskDetail as TaskDetailSlots } from "./slots";
export {
  TaskDetailFilePeekProvider,
  useTaskDetailFilePeek,
  useFlushAll,
  useRegisterFlush,
} from "./context";
export { TaskDetail } from "./components/task-detail";
export { tasksRootPane, taskDetailPane, taskConversationPane } from "./panes";

export default {
  id: "task-detail",
  name: "Task Detail",
  description:
    "Owns the /tasks pane host and the right-pane detail view for a selected task. Defines TaskDetail.{Above,Section,SidePanel} slots and the file-peek + flush-registry context that section sub-plugins share.",
  contributions: [
    Pane.Register({ pane: tasksRootPane }),
    Pane.Register({ pane: taskDetailPane }),
    Pane.Register({ pane: taskConversationPane }),
    Shell.Sidebar({
      title: "Tasks",
      icon: MdChecklist,
      group: "System",
      onClick: () => tasksRootPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
