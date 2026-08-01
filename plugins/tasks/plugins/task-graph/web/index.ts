import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskGraph } from "./components/task-graph";
import { useTaskGraphAvailable } from "./hooks";

export default {
  description:
    "Renders the dependency-DAG as a card at the foot of a task's detail when the task has dependents or dependencies.",
  contributions: [
    TaskDetailSlots.Section({
      id: "graph",
      label: "Graph",
      component: TaskGraph,
      // The body used to `return null` for a task with no edges, which under
      // host-owned chrome would paint an empty card.
      useAvailable: useTaskGraphAvailable,
      useDefaultOpen: () => true,
      // `excludeFromReorder` would in fact pin it last (which is where it wants
      // to be), but the flag is omitted for the same reason as `task-header`'s:
      // "pinned last" is the only thing it can express, so using it here and not
      // there would make the two behave by accident rather than by rule. Foot
      // position comes from registration order.
    }),
  ],
} satisfies PluginDefinition;
