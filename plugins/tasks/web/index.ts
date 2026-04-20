import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { ShellCommands } from "@plugins/shell/web";
import { MdChecklist } from "react-icons/md";
import { tasksPane } from "./views";
import { Tasks as TasksSlots } from "./slots";
import { LaunchAgentAction } from "./components/launch-agent-action";
import { DeleteTaskAction } from "./components/delete-task-action";
import { ExpandCollapseAllAction } from "./components/expand-collapse-all-action";
import { NewTaskButton } from "./components/new-task-button";
export { Tasks } from "./slots";
export { TasksList } from "./components/tasks-list";
export { TaskDetail } from "./components/task-detail";

export default {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts; meta-plugin hosting sub-pane contributions.",
  contributions: [
    Shell.Toolbar({
      component: NewTaskButton,
      group: "actions",
    }),
    Shell.Sidebar({
      title: "Tasks",
      icon: MdChecklist,
      group: "System",
      onClick: () => ShellCommands.OpenPane(tasksPane()),
    }),
    Shell.Route({
      pattern: "/tasks",
      resolve: () => tasksPane(),
    }),
    Shell.Route({
      pattern: "/tasks/:id",
      resolve: (params) => tasksPane({ id: params.id }),
    }),
    TasksSlots.TaskActions({
      id: "expand-collapse-all",
      component: ExpandCollapseAllAction,
    }),
    TasksSlots.TaskActions({ id: "delete", component: DeleteTaskAction }),
    TasksSlots.TaskActions({ id: "launch-agent", component: LaunchAgentAction }),
  ],
} satisfies PluginDefinition;
