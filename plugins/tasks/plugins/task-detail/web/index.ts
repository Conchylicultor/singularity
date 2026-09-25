import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { opensPane } from "@plugins/primitives/plugins/app-shell/web";
import { MdChecklist } from "react-icons/md";
import { tasksRootPane, taskDetailPane } from "./panes";
import { TaskDetail as TaskDetailSectionSlots } from "./slots";

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
      title: "Tasks",
      icon: MdChecklist,
      opens: opensPane(tasksRootPane, {}),
    }),
  ],
  slots: {
    ...TaskDetailSectionSlots,
    "tasks-root": tasksRootPane,
    "task-detail": taskDetailPane,
  },
} satisfies PluginDefinition;
