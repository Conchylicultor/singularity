import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { TaskListItem } from "@plugins/tasks/plugins/tasks-core/core";
import type { ComponentType } from "react";

export interface TaskViewProps {
  selectedId?: string;
  rootTaskId?: string;
  onSelect: (id: string) => void;
}

const tabbedView = defineTabbedView<TaskViewProps>("tasks");

export const Tasks = {
  View: tabbedView.View,
  Host: tabbedView.Host,
  TaskActions: defineItemActions<TaskListItem>("tasks.task-actions"),
  ListActions: defineRenderSlot<{
    component: ComponentType;
  }>("tasks.list-actions", { docLabel: (p) => p.id }),
};
