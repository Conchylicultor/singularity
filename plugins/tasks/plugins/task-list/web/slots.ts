import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Tasks = {
  List: defineSlot<{
    id: string;
    component: ComponentType;
  }>("tasks.list"),
  TaskActions: defineSlot<{
    id: string;
    component: ComponentType<{ taskId: string; hasChildren: boolean }>;
  }>("tasks.task-actions"),
  ListActions: defineSlot<{
    id: string;
    component: ComponentType;
  }>("tasks.list-actions"),
};
