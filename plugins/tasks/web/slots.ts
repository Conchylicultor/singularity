import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Tasks = {
  List: defineSlot<{
    id: string;
    component: ComponentType;
  }>("tasks.list"),
  View: defineSlot<{
    id: string;
    title?: string;
    component: ComponentType<{ taskId: string }>;
  }>("tasks.view"),
  TaskActions: defineSlot<{
    id: string;
    component: ComponentType<{ taskId: string }>;
  }>("tasks.task-actions"),
};
