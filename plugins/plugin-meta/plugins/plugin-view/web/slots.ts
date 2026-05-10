import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { PluginNode } from "../shared/types";

export const PluginView = {
  Section: defineSlot<{
    id: string;
    order?: number;
    component: ComponentType<{ node: PluginNode }>;
  }>("plugin-view.section"),
};
