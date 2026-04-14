import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Tasks = {
  PanePanel: defineSlot<{
    id: string;
    title: string;
    component: ComponentType;
  }>("tasks.pane-panel"),
};
