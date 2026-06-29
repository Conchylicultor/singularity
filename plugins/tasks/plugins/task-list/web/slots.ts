import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import type { ComponentType } from "react";

export const Tasks = {
  TaskActions: defineItemActions<TaskListItem>("tasks.task-actions"),
  ListActions: defineRenderSlot<{
    component: ComponentType;
  }>("tasks.list-actions", { docLabel: (p) => p.id }),
};
