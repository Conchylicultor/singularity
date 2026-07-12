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
export { useFlushAll, useRegisterFlush } from "./context";
export { TaskDetail } from "./components/task-detail";
export { tasksRootPane, taskDetailPane } from "./panes";

export default {
  description:
    "Owns the /tasks pane host and the right-pane detail view for a selected task. Defines the TaskDetail.Section slot and the flush-registry context that section sub-plugins share.",
  contributions: [
    Pane.Register({ pane: tasksRootPane }),
    Pane.Register({ pane: taskDetailPane }),
    Shell.Sidebar({
      id: "tasks",
      ...sidebarNavItem({ title: "Tasks", icon: MdChecklist, onClick: () => openPane(tasksRootPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
