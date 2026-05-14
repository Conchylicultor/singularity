import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { MdChecklist } from "react-icons/md";
import {
  tasksRootPane,
  taskDetailPane,
} from "./panes";

export { TaskDetail as TaskDetailSlots } from "./slots";
export {
  TaskNavigateProvider,
  useTaskNavigate,
  useFlushAll,
  useRegisterFlush,
} from "./context";
export { TaskDetail } from "./components/task-detail";
export { TaskTreeDetail } from "./components/task-tree-detail";
export { tasksRootPane, taskDetailPane } from "./panes";

export default {
  id: "task-detail",
  name: "Task Detail",
  description:
    "Owns the /tasks pane host and the right-pane detail view for a selected task. Defines TaskDetail.{Above,Section} slots and the file-open + flush-registry contexts that section sub-plugins share.",
  contributions: [
    Pane.Register({ pane: tasksRootPane }),
    Pane.Register({ pane: taskDetailPane }),
    Shell.Sidebar({
      id: "tasks",
      ...sidebarNavItem({ title: "Tasks", icon: MdChecklist, onClick: () => openPane(tasksRootPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
