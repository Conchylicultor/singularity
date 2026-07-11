import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { DepsTreeSection } from "./components/deps-tree-section";
import { DepsActions, DetachAction } from "./internal/deps-actions";

export default {
  description:
    "Dependency tree section for the task detail: renders task_dependencies as a nesting = runs-after tree (with a switch to the read-only creation tree), atomic drag-to-reorder, per-row detach, and 'also after' fan-in chips.",
  contributions: [
    TaskDetailSlots.Section({
      id: "deps-tree",
      label: "Dependencies",
      component: DepsTreeSection,
    }),
    DepsActions({ id: "detach", component: DetachAction }),
  ],
} satisfies PluginDefinition;
