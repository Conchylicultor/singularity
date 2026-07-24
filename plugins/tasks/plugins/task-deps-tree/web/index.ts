import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdAccountTree, MdFolderOpen } from "react-icons/md";
import { TaskDetailSlots } from "@plugins/tasks/plugins/task-detail/web";
import { DepsTreeSection } from "./components/deps-tree-section";
import { DepsActions, DetachAction } from "./internal/deps-actions";
import { DepsSources, DepsSource, CreatedSource } from "./internal/deps-sources";

export default {
  description:
    "Dependency tree section for the task detail: a merged DataView whose sources render task_dependencies as a nesting = runs-after tree (atomic drag-to-reorder, per-row detach, 'also after' fan-in chips) or the read-only creation tree.",
  contributions: [
    TaskDetailSlots.Section({
      id: "deps-tree",
      label: "Dependencies",
      component: DepsTreeSection,
    }),
    DepsActions({ id: "detach", component: DetachAction }),
    // Both sources of the merged deps-tree surface are contributed here — the
    // slot and its contributors live in one plugin on purpose (nothing imports
    // deps-tree for this; the Created source composes task-list's exports).
    DepsSources({
      id: "deps",
      title: "Dependencies",
      icon: MdAccountTree,
      order: 5,
      views: ["tree"],
      hasHierarchy: true,
      component: DepsSource,
    }),
    DepsSources({
      id: "created",
      title: "Created",
      icon: MdFolderOpen,
      order: 10,
      views: ["tree"],
      hasHierarchy: true,
      component: CreatedSource,
    }),
  ],
} satisfies PluginDefinition;
