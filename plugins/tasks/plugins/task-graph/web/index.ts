import type { PluginDefinition } from "@core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskGraph } from "./components/task-graph";

export default {
  id: "task-graph",
  name: "Task: Graph",
  description:
    "Renders the dependency-DAG band above a task's detail when the task has dependents or dependencies.",
  contributions: [
    TaskDetailSlots.Above({ id: "graph", order: 0, component: TaskGraph }),
  ],
} satisfies PluginDefinition;
