import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Profiling = {
  Section: defineSlot<{
    id: string;
    order: number;
    component: ComponentType;
  }>("profiling.section"),
};
