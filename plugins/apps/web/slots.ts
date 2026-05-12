import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Apps = {
  App: defineRenderSlot<{
    icon: ComponentType<{ className?: string }>;
    tooltip: string;
    component: ComponentType;
    path: string;
    onClick?: () => void;
  }>("apps.app", {
    docLabel: (p) => p.tooltip,
  }),
};
