import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";

export const Stats = {
  Chart: defineRenderSlot<{
    title: string;
    component: ComponentType;
  }>("stats.chart", { docLabel: (p) => p.title }),
};
