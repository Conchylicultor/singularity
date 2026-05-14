import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";

export const Tasks = {
  List: defineSlot<{
    id: string;
    component: ComponentType;
  }>("tasks.list", { docLabel: (p) => p.id }),
  TaskActions: defineSlot<{
    id: string;
    component: ComponentType<{ taskId: string; hasChildren: boolean }>;
  }>("tasks.task-actions", { docLabel: (p) => p.id }),
  ListActions: defineSlot<{
    id: string;
    component: ComponentType;
  }>("tasks.list-actions", { docLabel: (p) => p.id }),
};
