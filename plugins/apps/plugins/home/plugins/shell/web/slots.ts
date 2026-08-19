import type { ComponentType } from "react";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Home = {
  Section: defineRenderSlot<{
    label: string;
    component: ComponentType;
  }>({ docLabel: (p) => p.label }),
};
