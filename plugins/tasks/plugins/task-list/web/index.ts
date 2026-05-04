import type { PluginDefinition } from "@core";
import { Tasks as TasksSlots } from "./slots";
import { DeleteTaskAction } from "./components/delete-task-action";
import { ExpandCollapseAllAction } from "./components/expand-collapse-all-action";
import { LaunchAgentAction } from "./components/launch-agent-action";

export { Tasks } from "./slots";
export { TasksList } from "./components/tasks-list";

export default {
  id: "task-list",
  name: "Task: List",
  description:
    "Tree view of all tasks rendered in the Tasks pane. Defines Tasks.List/TaskActions/ListActions slots and ships the row actions (delete, expand-all, launch-agent).",
  contributions: [
    TasksSlots.TaskActions({
      id: "expand-collapse-all",
      component: ExpandCollapseAllAction,
    }),
    TasksSlots.TaskActions({ id: "delete", component: DeleteTaskAction }),
    TasksSlots.TaskActions({ id: "launch-agent", component: LaunchAgentAction }),
  ],
} satisfies PluginDefinition;
