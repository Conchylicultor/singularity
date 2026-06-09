import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskDependencies } from "./components/task-dependencies";
import { TaskDependents } from "./components/task-dependents";

export default {
  description:
    "Lists the task's dependencies as removable chips, with a quick-add button for the folder task when applicable.",
  contributions: [
    TaskDetailSlots.Section({ id: "dependencies", label: "Dependencies", component: TaskDependencies }),
    TaskDetailSlots.Section({ id: "dependents", label: "Dependents", component: TaskDependents }),
  ],
} satisfies PluginDefinition;
