import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import {
  TaskDependencies,
  TaskDependenciesActions,
} from "./components/task-dependencies";

export default {
  description:
    "Both ends of the task's dependency edges in one card: the tasks it runs after and the tasks it blocks, as removable chips, with prerequisite / follow-up add affordances (and a quick-add for the folder task when applicable) in the header.",
  contributions: [
    // ONE card for the relation, not one per direction: `Dependencies` and
    // `Dependents` were the same edge read from opposite ends, painted with
    // identical chrome — two titles and two cards for a fact the user reads as
    // one. The header actions already spanned both directions.
    TaskDetailSlots.Section({
      id: "dependencies",
      label: "Dependencies",
      component: TaskDependencies,
      // The former SectionHeaderRow `actions`, now the card's header controls.
      actions: TaskDependenciesActions,
      // The card stays painted with no relations at all (no `useAvailable`):
      // its header actions are how the first one gets added.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;
