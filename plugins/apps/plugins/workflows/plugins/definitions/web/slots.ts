import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";

export const WorkflowsDetail = {
  Section: defineRenderSlot<{
    title: string;
    order: number;
    component: ComponentType<{ definitionId: string }>;
  }>("workflows.detail.section", { docLabel: (p) => p.title }),
};
