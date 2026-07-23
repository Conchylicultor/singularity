import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import {
  defineFieldExtensions,
  defineItemActions,
} from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import type { ComponentType } from "react";

export const Tasks = {
  TaskActions: defineItemActions<TaskListItem>("tasks.task-actions"),
  ListActions: defineRenderSlot<{
    component: ComponentType;
  }>("tasks.list-actions", { docLabel: (p) => p.id }),
  // Extra DataView `FieldDef<TaskListItem>[]` injected by other plugins. A field
  // extension is a *component* (not plain data) so its `value` closure can
  // capture hook-loaded data — e.g. `category` reads its own live resource and
  // yields a `category` enum field. Mirrors the page-tree `PageTree.Fields` seam.
  Fields: defineFieldExtensions<TaskListItem>("tasks.fields"),
};
