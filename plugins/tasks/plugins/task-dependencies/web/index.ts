import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import {
  TaskDependencies,
  TaskDependenciesActions,
} from "./components/task-dependencies";
import {
  TaskDependents,
  useHasDependents,
} from "./components/task-dependents";

export default {
  description:
    "Lists the task's dependencies as removable chips, with a quick-add button for the folder task when applicable.",
  contributions: [
    TaskDetailSlots.Section({
      id: "dependencies",
      label: "Dependencies",
      component: TaskDependencies,
      // The former SectionHeaderRow `actions`, now the card's header controls.
      actions: TaskDependenciesActions,
      // Was a `Collapsible defaultOpen` before the host owned the card.
      useDefaultOpen: () => true,
    }),
    TaskDetailSlots.Section({
      id: "dependents",
      label: "Dependents",
      component: TaskDependents,
      // Nothing depends on this task ⇒ no card. `Dependencies` above keeps its
      // card even when empty: its header actions are how you add the first one.
      useAvailable: useHasDependents,
      // Was a `Collapsible defaultOpen` before the host owned the card.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;
