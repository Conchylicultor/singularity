import type { PluginDefinition } from "@core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskDependencies } from "./components/task-dependencies";

export default {
  id: "task-dependencies",
  name: "Task: Dependencies",
  description:
    "Lists the task's dependencies as removable chips, with a quick-add button for the parent task when applicable.",
  contributions: [
    TaskDetailSlots.Section({ id: "dependencies", label: "Dependencies", component: TaskDependencies }),
  ],
} satisfies PluginDefinition;
