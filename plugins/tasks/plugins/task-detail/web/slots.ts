import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const TaskDetail = {
  Above: defineSlot<{
    id: string;
    order?: number;
    component: ComponentType<{ taskId: string }>;
  }>("task-detail.above"),

  Section: defineSlot<{
    id: string;
    order?: number;
    component: ComponentType<{ taskId: string }>;
  }>("task-detail.section"),
};
