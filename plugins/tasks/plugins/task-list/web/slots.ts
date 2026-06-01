import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { defineTabbedView } from "@plugins/primitives/plugins/tabbed-view/web";
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
  TaskActions: defineRenderSlot<{
    component: ComponentType<{ taskId: string; hasChildren: boolean }>;
  }>("tasks.task-actions", { docLabel: (p) => p.id }),
  ListActions: defineRenderSlot<{
    component: ComponentType;
  }>("tasks.list-actions", { docLabel: (p) => p.id }),
};
