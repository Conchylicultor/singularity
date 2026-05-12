import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Deploy = {
  Section: defineSlot<{
    id: string;
    title: string;
    order: number;
    component: ComponentType<{ serverId: string }>;
  }>("deploy.section", { docLabel: (p) => p.title }),
};
