import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";

export const Profiling = {
  Section: defineRenderSlot<{
    order: number;
    component: ComponentType;
  }>("profiling.section"),
};
