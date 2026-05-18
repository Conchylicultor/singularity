import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
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
  TaskActions: defineSlot<{
    id: string;
    component: ComponentType<{ taskId: string; hasChildren: boolean }>;
  }>("tasks.task-actions", { docLabel: (p) => p.id }),
  ListActions: defineSlot<{
    id: string;
    component: ComponentType;
  }>("tasks.list-actions", { docLabel: (p) => p.id }),
};
