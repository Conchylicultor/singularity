import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { TaskGraph } from "./components/task-graph";

export default {
  description:
    "Renders the dependency-DAG as a card at the foot of a task's detail when the task has dependents or dependencies.",
  contributions: [
    TaskDetailSlots.Section({
      id: "graph",
      label: "Graph",
      component: TaskGraph,
      // A canvas, not a titled panel: it keeps its own fixed-height frame.
      //
      // `excludeFromReorder` would in fact pin it last (which is where it wants
      // to be), but the flag is omitted for the same reason as `task-header`'s:
      // "pinned last" is the only thing it can express, so using it here and not
      // there would make the two identity-ish sections behave by accident rather
      // than by rule. Foot position comes from registration order.
      chrome: "none",
    }),
  ],
} satisfies PluginDefinition;
