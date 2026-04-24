import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { MdChecklist } from "react-icons/md";
import { tasksRootPane } from "./panes";
import { Tasks as TasksSlots } from "./slots";
import { LaunchAgentAction } from "./components/launch-agent-action";
import { DeleteTaskAction } from "./components/delete-task-action";
import { ExpandCollapseAllAction } from "./components/expand-collapse-all-action";
export { Tasks } from "./slots";
export { TasksList } from "./components/tasks-list";
export { TaskDetail } from "./components/task-detail";
export { tasksRootPane, taskDetailPane, taskConversationPane } from "./panes";

export default {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts; meta-plugin hosting sub-pane contributions.",
  contributions: [
    Shell.Sidebar({
      title: "Tasks",
      icon: MdChecklist,
      group: "System",
      onClick: () => tasksRootPane.open({}),
    }),
    TasksSlots.TaskActions({
      id: "expand-collapse-all",
      component: ExpandCollapseAllAction,
    }),
    TasksSlots.TaskActions({ id: "delete", component: DeleteTaskAction }),
    TasksSlots.TaskActions({ id: "launch-agent", component: LaunchAgentAction }),
  ],
} satisfies PluginDefinition;
