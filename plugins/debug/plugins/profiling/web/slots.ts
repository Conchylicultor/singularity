import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";

export const Profiling = {
  Section: defineSlot<{
    id: string;
    order: number;
    component: ComponentType;
  }>("profiling.section"),
};
