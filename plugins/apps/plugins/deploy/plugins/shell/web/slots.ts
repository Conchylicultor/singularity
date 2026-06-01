import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";

export const Deploy = {
  Section: defineRenderSlot<{
    title: string;
    order: number;
    component: ComponentType<{ serverId: string }>;
  }>("deploy.section", { docLabel: (p) => p.title }),
};
