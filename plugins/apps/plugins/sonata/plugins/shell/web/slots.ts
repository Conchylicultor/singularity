import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Sonata = {
  Section: defineRenderSlot<{
    label: string;
    icon?: ComponentType<{ className?: string }>;
    component: ComponentType;
    area?: "editor" | "player";
  }>("sonata.section", {
    docLabel: (p) => p.label,
  }),
};
