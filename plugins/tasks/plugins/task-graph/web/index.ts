import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskGraph } from "./components/task-graph";

export default {
  description:
    "Renders the dependency-DAG as a card at the foot of a task's detail when the task has dependents or dependencies.",
  contributions: [
    TaskDetailSlots.Section({ id: "graph", label: "Graph", component: TaskGraph }),
  ],
} satisfies PluginDefinition;
